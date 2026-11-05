'use strict';
const sharp=require('sharp');
const {dimensions,portraitCrop}=require('../public-portrait-geometry.cjs');
const {PublicFaceLandmarks}=require('../public-landmarks/service.cjs');
const {projectConfidence}=require('../public-segmentation/service.cjs');
const {oralCrop,selectTeethPixels}=require('./geometry.cjs');
class PublicTeethSegmenter{
 constructor({landmarks=new PublicFaceLandmarks()}={}){this.landmarks=landmarks;this.closed=false;this.running=false;this.active=null;this.closing=null;}
 // 输出普通牙齿选区，不生成私有模型平面或改写照片；闭嘴返回空选区。
 async segment(bytes,box,width,height,kind='teeth'){
  if(this.closed)throw new Error('牙齿选区服务已关闭');if(this.running)throw new Error('正在识别牙齿，请稍候');
  if(kind!=='teeth')throw new Error('不支持的人像分区');dimensions(width,height,1600*1600);if(width>1600||height>1600)throw new Error('选区尺寸过大');
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw new Error('照片数据无效');portraitCrop(box,width,height,'skin');
  this.running=true;let finish;this.active=new Promise(resolve=>{finish=resolve;});const start=performance.now();
  try{
   const image=sharp(bytes,{limitInputPixels:80000000}),meta=await image.metadata(),rotated=meta.orientation>=5&&meta.orientation<=8,sourceWidth=rotated?meta.height:meta.width,sourceHeight=rotated?meta.width:meta.height;
   const face=await this.landmarks.detect(bytes,box),{crop,polygon}=oralCrop(face,sourceWidth,sourceHeight);
   const {data,info}=await image.rotate().extract(crop).flatten({background:'#000000'}).toColourspace('srgb').removeAlpha().resize({width:512,height:512,fit:'inside',withoutEnlargement:true,kernel:'linear'}).raw().toBuffer({resolveWithObject:true});
   if(info.channels!==3)throw new Error('照片颜色格式无效');
   const result=selectTeethPixels(data,info.width,info.height,polygon.map(p=>({x:p.x*info.width/crop.width,y:p.y*info.height/crop.height})));
   const alpha=projectConfidence(result,crop,sourceWidth,sourceHeight,width,height),rgba=Buffer.alloc(width*height*4,255);let foreground=0;
   for(let i=0;i<alpha.length;i++){rgba[i*4+3]=alpha[i];if(alpha[i]>127)foreground++;}
   const png=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
   return {mask:png.toString('base64'),width,height,seconds:(performance.now()-start)/1000,foregroundFraction:foreground/alpha.length,region:'teeth',backend:'public-oral-color',model:'MediaPipe Face Landmarker · 公开口腔轮廓与颜色筛选',experimental:true};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;await this.landmarks.close();})();return this.closing;}
}
module.exports={PublicTeethSegmenter};
