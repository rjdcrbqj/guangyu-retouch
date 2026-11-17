'use strict';
const sharp=require('sharp');
const {PublicPortraitSegmenter}=require('./public-segmentation/service.cjs');
const {runPhotoWorker}=require('./public-frame-worker.cjs');
class PublicHairEffectService{
 constructor(workflow,{segmentation=new PublicPortraitSegmenter()}={}){this.workflow=workflow;this.segmentation=segmentation;this.closed=false;this.active=null;this.closing=null;}
 // 直接识别整图头发，不要求人脸；原尺寸像素只交给自主修饰工作线程。
 async repair(bytes,options){
  if(this.closed)throw Error(this.workflow.label+'服务已关闭');if(this.active)throw Error(this.workflow.label+'正在处理，请稍候');const settings=this.workflow.settings(options);
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw Error('照片内容无效');
  let done;this.active=new Promise(resolve=>done=resolve);const start=performance.now();
  try{
   const {data,info:{width,height}}=await sharp(bytes,{limitInputPixels:80000000,failOn:'error'}).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const scale=Math.min(1,1600/Math.max(width,height)),mw=Math.max(1,Math.round(width*scale)),mh=Math.max(1,Math.round(height*scale));
   const segmented=await this.segmentation.segment(bytes,null,mw,mh,'hair',{wholeImage:true});if(segmented.width!==mw||segmented.height!==mh)throw Error('头发分区尺寸不一致');
   const {data:mask,info}=await sharp(Buffer.from(segmented.mask,'base64'),{limitInputPixels:1600*1600}).extractChannel('alpha').raw().toBuffer({resolveWithObject:true});if(info.width!==mw||info.height!==mh)throw Error('头发蒙版尺寸不一致');
   const detectedRegions=mask.some(v=>v>200)?1:0,result=detectedRegions?await runPhotoWorker(this.workflow.worker,{data,width,height,mask,maskWidth:mw,maskHeight:mh,settings}):{changedRGBFields:0};
   const png=result.output?await sharp(result.output,{raw:{width,height,channels:4}}).png().toBuffer():Buffer.alloc(0);
   return {png,width,height,changedRGBFields:result.changedRGBFields,processedRegions:detectedRegions,detectedRegions,seconds:(performance.now()-start)/1000,backend:this.workflow.backend,nativeApplicationParity:false};
  }finally{this.active=null;done();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;await this.segmentation.close();})();return this.closing;}
}
module.exports={PublicHairEffectService};
