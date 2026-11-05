'use strict';
const path=require('node:path'),{openPublicPhoto}=require('../public-photo.cjs');
const {PublicSegmentationRuntime}=require('../public-segmentation/runtime.cjs');
const {dimensions,portraitCrop}=require('../public-portrait-geometry.cjs');
const {PublicFaceDetector}=require('../public-yunet/detector.cjs');
const unreliable=message=>Object.assign(new Error(message),{code:'ERR_PUBLIC_LANDMARKS_UNRELIABLE'});

// 公共 478 点保持独立格式，不映射或冒充原模型的 194 点。
function restoreLandmarks(points,crop,width,height){
 dimensions(width,height);
 if(!Array.isArray(points)||points.length!==478)throw new Error('公开面部定位必须输出 478 个关键点');
 if(!crop||!['left','top','width','height'].every(k=>Number.isInteger(crop[k]))||crop.left<0||crop.top<0||crop.width<1||crop.height<1||crop.left+crop.width>width||crop.top+crop.height>height)throw new Error('面部定位裁剪范围无效');
 return points.map(p=>{
  if(!p||!['x','y','z'].every(k=>Number.isFinite(p[k]))||Math.abs(p.x)>4||Math.abs(p.y)>4||Math.abs(p.z)>4)throw new Error('公开面部关键点无效');
  return {x:(crop.left+p.x*crop.width)/width,y:(crop.top+p.y*crop.height)/height,z:p.z*crop.width/width};
 });
}

class PublicFaceLandmarks{
 constructor({runtime=new PublicSegmentationRuntime({workerFile:path.join(__dirname,'worker.html'),taskName:'Landmarks'}),detector=new PublicFaceDetector()}={}){this.runtime=runtime;this.detector=detector;this.running=false;this.closed=false;this.active=null;this.closing=null;}
 async detect(bytes,box){
  if(this.closed)throw new Error('面部定位服务已关闭');
  if(this.running)throw new Error('正在定位面部，请稍候');
  this.running=true;let finish;this.active=new Promise(resolve=>{finish=resolve;});
  const start=performance.now();
  try{
   const image=openPublicPhoto(bytes),meta=await image.metadata(),rotated=meta.orientation>=5&&meta.orientation<=8;
   const width=rotated?meta.height:meta.width,height=rotated?meta.width:meta.height,crop=portraitCrop(box,width,height,'skin');
   const png=await image.rotate().extract(crop).flatten({background:'#000000'}).toColourspace('srgb').removeAlpha().resize({width:512,height:512,fit:'inside',kernel:'linear'}).png().toBuffer();
   const {selectFace,boxOverlap}=await import('./geometry.mjs');
   const target={x:(box.x*width-crop.left)/crop.width,y:(box.y*height-crop.top)/crop.height,width:box.width*width/crop.width,height:box.height*height/crop.height};
   if(box.keypoints){
    if(!Array.isArray(box.keypoints)||box.keypoints.length!==5||!box.keypoints.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))throw new Error('人脸五点定位无效');
    target.keypoints=box.keypoints.map(p=>({x:(p.x*width-crop.left)/crop.width,y:(p.y*height-crop.top)/crop.height}));
   }else{
    // 手动框脸也要有独立五点依据；先在放大的裁剪图中找脸。
    const detection=await this.detector.detect(png),candidate=detection.boxes.filter(b=>boxOverlap(b,target)>.1).sort((a,b)=>boxOverlap(b,target)-boxOverlap(a,target))[0];
    if(!candidate)throw unreliable('未能可靠核对五官位置，原选区已保留');target.keypoints=candidate.keypoints;
   }
   const verifiedBox={...box,keypoints:target.keypoints.map(p=>({x:(crop.left+p.x*crop.width)/width,y:(crop.top+p.y*crop.height)/height}))};
   const result=await this.runtime.run({image:'data:image/png;base64,'+png.toString('base64'),box:target});
   if(!Array.isArray(result?.faces)||result.faces.length>3)throw new Error('面部定位输出无效');
   const points=selectFace(result.faces.map(face=>restoreLandmarks(face,crop,width,height)),verifiedBox);
   if(!points)throw unreliable('未能可靠定位面部，原选区已保留，请重新框住完整脸部');
   return {type:'mediapipe-478',points,width,height,box:verifiedBox,rotationsTried:result.rotationsTried,detectionThreshold:result.detectionThreshold,seconds:(performance.now()-start)/1000};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;await Promise.all([this.runtime.close(),this.detector.close()]);})();return this.closing;}
}
module.exports={PublicFaceLandmarks,restoreLandmarks};
