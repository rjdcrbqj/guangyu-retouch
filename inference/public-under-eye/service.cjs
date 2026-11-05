"use strict";
// 共用公开眼部图像处理；具体算法、控制和作用区域由独立流程提供。
const sharp=require('sharp'),{PublicFaceDetector}=require('../public-yunet/detector.cjs'),{PublicFaceLandmarks}=require('../public-landmarks/service.cjs'),{PublicPortraitSegmenter}=require('../public-segmentation/service.cjs'),{preparePublicEyes}=require('../public-bright-eye/geometry.cjs'),{eyeVisibility}=require('../public-bright-eye/visibility.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function sample(data,width,height,channels,x,y,c){x=clamp(x,0,width-1);y=clamp(y,0,height-1);const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(width-1,ix+1),jy=Math.min(height-1,iy+1),dx=x-ix,dy=y-iy;return data[(iy*width+ix)*channels+c]*(1-dx)*(1-dy)+data[(iy*width+jx)*channels+c]*dx*(1-dy)+data[(jy*width+ix)*channels+c]*(1-dx)*dy+data[(jy*width+jx)*channels+c]*dx*dy;}
function eyeRGB(side,data,width,height){const out=Buffer.alloc(side.maskWidth*side.maskHeight*3),[left,top,rw,rh]=side.roi;for(let y=0;y<side.maskHeight;y++)for(let x=0;x<side.maskWidth;x++){const sx=left+(x+.5)*rw/side.maskWidth-.5,sy=top+(y+.5)*rh/side.maskHeight-.5,alpha=sample(data,width,height,4,sx,sy,3)/255;for(let c=0;c<3;c++)out[(y*side.maskWidth+x)*3+c]=Math.round(sample(data,width,height,4,sx,sy,c)*alpha);}return out;}
class PublicUnderEyeService{
 constructor({workflow,detector=new PublicFaceDetector(),landmarks=new PublicFaceLandmarks(),segmentation}={}){this.workflow=workflow;this.detector=detector;this.landmarks=landmarks;this.segmentation=segmentation??new PublicPortraitSegmenter({landmarks});this.closed=false;this.running=false;this.active=null;this.closing=null;}
 async repair(bytes,options){
  const effect=this.workflow;if(this.closed)throw Error(effect.label+'服务已关闭');if(this.running)throw Error('正在'+effect.label+'，请稍候');if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw Error('照片内容无效');const controls=effect.controls(options);
  this.running=true;let finish;this.active=new Promise(r=>finish=r);const start=performance.now();
  try{
   const decoded=await sharp(bytes,{limitInputPixels:80000000,failOn:'error'}).rotate().toColourspace('srgb').ensureAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true}),{width,height,channels}=decoded.info;if(channels!==4||![width,height].every(n=>Number.isInteger(n)&&n>=2&&n<=32766))throw Error('照片尺寸无效');
   const found=await this.detector.detect(bytes);if(found.width!==width||found.height!==height)throw Error('面部定位与照片尺寸不一致');const output=Buffer.from(decoded.data),faces=[],previewScale=Math.min(1,1600/Math.max(width,height)),pw=Math.max(1,Math.round(width*previewScale)),ph=Math.max(1,Math.round(height*previewScale));
   for(const box of found.boxes.slice(0,8)){
    const landmarks=await this.landmarks.detect(bytes,box);if(landmarks.width!==width||landmarks.height!==height)throw Error('眼部定位与照片尺寸不一致');const eyes=preparePublicEyes(landmarks).sides.filter(s=>eyeVisibility(s,eyeRGB(s,decoded.data,width,height)).visible);if(!eyes.length)continue;
    const segmented=await this.segmentation.segment(bytes,box,pw,ph,'skin'),mask=await sharp(Buffer.from(segmented.mask,'base64'),{limitInputPixels:1600*1600}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});if(mask.info.width!==pw||mask.info.height!==ph||mask.info.channels!==4)throw Error('眼下皮肤分区尺寸无效');
    const skinAt=(x,y)=>sample(mask.data,pw,ph,4,(x+.5)*pw/width-.5,(y+.5)*ph/height-.5,3)/255,sides=[];let faceChanged=0;
    for(const eye of eyes){
     const region=effect.region(landmarks,eye.side);if(!region)continue;const {crop}=region,scale=Math.min(1,512/Math.max(crop.width,crop.height)),w=Math.min(512,Math.ceil(crop.width*scale)),h=Math.min(512,Math.ceil(crop.height*scale)),rgb=Buffer.alloc(w*h*3),skin=new Float32Array(w*h),local={...region,origin:[(region.origin[0]-crop.left)*scale,(region.origin[1]-crop.top)*scale],eyeWidth:region.eyeWidth*scale,lower:region.lower*scale};
     for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=crop.left+(x+.5)/scale-.5,sy=crop.top+(y+.5)/scale-.5,i=y*w+x;skin[i]=skinAt(sx,sy)*sample(decoded.data,width,height,4,sx,sy,3)/255;for(let c=0;c<3;c++)rgb[i*3+c]=Math.round(sample(decoded.data,width,height,4,sx,sy,c));}
     const result=effect.correct({rgb,skin,width:w,height:h,region:local,strength:controls.strength,keep:controls.keep});let changed=0;
     if(result.changed)for(let y=crop.top;y<crop.top+crop.height;y++)for(let x=crop.left;x<crop.left+crop.width;x++){
      const i=(y*width+x)*4;if(!decoded.data[i+3]||skinAt(x,y)<=0)continue;const px=x+.5-region.origin[0],py=y+.5-region.origin[1],u=(px*region.u[0]+py*region.u[1])/region.eyeWidth,v=(px*region.down[0]+py*region.down[1]-region.lower)/region.eyeWidth;if(effect.weight(u,v,controls)<=0)continue;
      const sx=(x+.5-crop.left)*scale-.5,sy=(y+.5-crop.top)*scale-.5,candidate=[0,1,2].map(c=>clamp(Math.round(decoded.data[i+c]+sample(result.delta,w,h,3,sx,sy,c)),0,255));const gain=(candidate[0]-decoded.data[i])*.2126+(candidate[1]-decoded.data[i+1])*.7152+(candidate[2]-decoded.data[i+2])*.0722,oldGain=(output[i]-decoded.data[i])*.2126+(output[i+1]-decoded.data[i+1])*.7152+(output[i+2]-decoded.data[i+2])*.0722;
      // 重叠区域只选择一次更明显的校正，不叠加放大；透明度与原图细节保持原值。
      if((effect.allowDarkening?Math.abs(gain):gain)>(effect.allowDarkening?Math.abs(oldGain):oldGain)+1e-6){for(let c=0;c<3;c++)output[i+c]=candidate[c];changed++;}
     }
     faceChanged+=changed;sides.push({side:eye.side,region,changed,reference:result.reference??null});
    }
    if(faceChanged)faces.push({sides,changed:faceChanged});
   }
   const png=faces.length?await sharp(output,{raw:{width,height,channels:4}}).png().toBuffer():Buffer.alloc(0);return {png,width,height,processedFaces:faces.length,detectedFaces:found.boxes.length,faces,seconds:(performance.now()-start)/1000,backend:effect.backend,nativeApplicationParity:false};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;await Promise.all([this.detector.close(),this.landmarks.close(),this.segmentation.close()]);})();return this.closing;}
}
module.exports={PublicUnderEyeService};
