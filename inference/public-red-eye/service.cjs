'use strict';
const sharp=require('sharp'),path=require('node:path');
const {PublicFaceDetector}=require('../public-yunet/detector.cjs'),{PublicFaceLandmarks}=require('../public-landmarks/service.cjs');
const {runPhotoWorker}=require('../public-frame-worker.cjs'),{eyeVisibility}=require('../public-bright-eye/visibility.cjs');
const {prepareRedEyeRegions}=require('./geometry.cjs'),{redEyeSettings}=require('./core.cjs');
class PublicRedEyeService{
 constructor({detector=new PublicFaceDetector(),landmarks=new PublicFaceLandmarks()}={}){this.detector=detector;this.landmarks=landmarks;this.closed=false;this.active=null;this.closing=null;}
 // 先完成全部人脸定位，再在独立线程按原尺寸处理；任何失败均不返回部分照片。
 async repair(bytes,options){
  if(this.closed)throw Error('红眼消除服务已关闭');if(this.active)throw Error('红眼消除正在处理，请稍候');const settings=redEyeSettings(options);
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw Error('照片内容无效');
  let done;this.active=new Promise(resolve=>done=resolve);const start=performance.now();
  try{
   const {data,info:{width,height}}=await sharp(bytes,{limitInputPixels:80000000,failOn:'error'}).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
   if(width>32768||height>32768)throw Error('红眼照片尺寸超出范围');
   const found=settings.strengthPercent?await this.detector.detect(bytes):{width,height,boxes:[]};
   if(found.width!==width||found.height!==height||!Array.isArray(found.boxes))throw Error('人脸定位与照片尺寸不匹配');
   const regions=[];
   for(const [faceIndex,box]of found.boxes.slice(0,8).entries()){
    const face=await this.landmarks.detect(bytes,box);if(face.width!==width||face.height!==height)throw Error('眼部定位与照片尺寸不匹配');
    for(const region of prepareRedEyeRegions(face)){
     const [left,top,rw,rh]=region.roi,rgb=await sharp(data,{raw:{width,height,channels:4}}).extract({left,top,width:rw,height:rh}).flatten({background:'#000000'}).removeAlpha().resize(region.maskWidth,region.maskHeight,{kernel:'linear'}).raw().toBuffer();
     if(eyeVisibility({...region,rgbaBase64:region.rgba.toString('base64')},rgb).visible)regions.push({...region,faceIndex});
    }
   }
   const result=regions.length?await runPhotoWorker(path.join(__dirname,'worker.cjs'),{data,width,height,regions,settings}):{changedRGBFields:0,processedEyes:0,processedFaceIndices:[]};
   const png=result.changedRGBFields?await sharp(result.output,{raw:{width,height,channels:4}}).png().toBuffer():Buffer.alloc(0);
   return {png,width,height,changedRGBFields:result.changedRGBFields,processedEyes:result.processedEyes,processedFaces:result.processedFaceIndices.length,detectedFaces:found.boxes.length,seconds:(performance.now()-start)/1000,backend:'public-red-eye',nativeApplicationParity:false};
  }finally{this.active=null;done();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;await Promise.all([this.landmarks.close(),this.detector.close()]);})();return this.closing;}
}
module.exports={PublicRedEyeService};
