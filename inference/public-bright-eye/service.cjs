"use strict";
const {PublicFaceDetector}=require('../public-yunet/detector.cjs'),{PublicFaceLandmarks}=require('../public-landmarks/service.cjs'),{preparePublicEyes}=require('./geometry.cjs');
const sharp=require('sharp'),{eyeVisibility}=require('./visibility.cjs');
class PublicBrightEyeService{
 constructor({detector=new PublicFaceDetector(),landmarks=new PublicFaceLandmarks()}={}){this.detector=detector;this.landmarks=landmarks;this.closed=false;this.running=false;this.active=null;this.closing=null;}
 async prepare(bytes){
  if(this.closed)throw Error('亮眼识别服务已关闭');if(this.running)throw Error('正在识别眼睛，请稍候');if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw Error('照片内容无效');
  this.running=true;let finish;this.active=new Promise(r=>finish=r);const start=performance.now();
  try{
   const found=await this.detector.detect(bytes),faces=[];
   for(const box of found.boxes.slice(0,8)){
    const landmarks=await this.landmarks.detect(bytes,box);if(landmarks.width!==found.width||landmarks.height!==found.height)throw Error('眼部定位与照片尺寸不匹配');
    const face=preparePublicEyes(landmarks);if(face.sides.length)faces.push(face);
   }
   const visibleFaces=[];
   for(const face of faces){const sides=[];for(const side of face.sides){const [left,top,width,height]=side.roi,rgb=await sharp(bytes,{limitInputPixels:80000000}).rotate().extract({left,top,width,height}).flatten({background:'#000000'}).toColourspace('srgb').removeAlpha().resize(side.maskWidth,side.maskHeight,{kernel:'linear'}).raw().toBuffer();if(eyeVisibility(side,rgb).visible)sides.push(side);}if(sides.length)visibleFaces.push({...face,sides});}
   return {faces:visibleFaces,sourceWH:[found.width,found.height],processedFaces:visibleFaces.length,detectedFaces:found.boxes.length,seconds:(performance.now()-start)/1000,backend:'public-478-eye-masks'};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;await Promise.all([this.landmarks.close(),this.detector.close()]);})();return this.closing;}
}
module.exports={PublicBrightEyeService};
