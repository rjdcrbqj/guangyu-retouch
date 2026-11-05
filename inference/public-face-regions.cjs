'use strict';
const sharp=require('sharp');
const {PublicFaceLandmarks}=require('./public-landmarks/service.cjs');
const {PublicFaceLandmarks66}=require('./public-face66/service.cjs');
const {facialRegionMask}=require('./public-landmarks/regions.cjs');
const {dimensions,portraitCrop}=require('./public-portrait-geometry.cjs');
class PublicFaceRegions{
 constructor({landmarks=new PublicFaceLandmarks(),fallback=new PublicFaceLandmarks66()}={}){this.landmarks=landmarks;this.fallback=fallback;this.closed=false;this.running=false;this.active=null;this.closing=null;}
 // 只生成选区 PNG；照片原始字节和现有编辑状态均不在此处修改。
 async segment(bytes,box,width,height,kind){
  if(this.closed)throw new Error('五官选区服务已关闭');if(this.running)throw new Error('正在识别五官选区，请稍候');
  if(!['lips','eyebrows'].includes(kind))throw new Error('不支持的人像分区');
  dimensions(width,height,1600*1600);if(width>1600||height>1600)throw new Error('选区尺寸过大');
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw new Error('照片数据无效');
  portraitCrop(box,width,height,'skin'); // 提前校验归一化人脸框，不启动无效任务。
  this.running=true;let finish;this.active=new Promise(resolve=>{finish=resolve;});const start=performance.now();
  try{
   let geometry;try{geometry=await this.landmarks.detect(bytes,box);}catch(error){if(kind!=='lips'||error.code!=='ERR_PUBLIC_LANDMARKS_UNRELIABLE')throw error;geometry=await this.fallback.detect(bytes,box);}
   const alpha=facialRegionMask(geometry,width,height,kind),rgba=Buffer.alloc(width*height*4,255);let foreground=0;
   for(let i=0;i<alpha.length;i++){rgba[i*4+3]=alpha[i];if(alpha[i]>127)foreground++;}
   const png=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
   return {mask:png.toString('base64'),width,height,seconds:(performance.now()-start)/1000,foregroundFraction:foreground/alpha.length,region:kind,backend:'public-landmark-contours',landmarkFormat:geometry.type,model:geometry.type==='openseeface-66'?'OpenSeeFace model 3 · BSD-2-Clause':'MediaPipe Face Landmarker · Apache-2.0',experimental:true};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;await Promise.all([this.landmarks.close(),this.fallback.close()]);})();return this.closing;}
}
module.exports={PublicFaceRegions};
