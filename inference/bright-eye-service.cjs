'use strict';
const sharp=require('sharp');
const {OriginalFaceLandmarks}=require('./face-landmarks.cjs');
const {BrightEyeExtraModel}=require('./bright-eye-extra-model.cjs');
class BrightEyeService{
 constructor({landmarks=new OriginalFaceLandmarks(),decode=bytes=>sharp(Buffer.from(bytes),{limitInputPixels:80000000}).rotate().toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true}),prepare,extraModel=new BrightEyeExtraModel()}={}){this.landmarks=landmarks;this.decode=decode;this.numericPrepare=prepare;this.extraModel=extraModel;this.running=false;this.closed=false;}
 async prepare(bytes){
  if(this.closed)throw Error('亮眼识别后端已关闭');if(this.running)throw Error('正在识别眼睛，请稍候');if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('照片内容无效');
  this.running=true;let finish;this.activeJob=new Promise(resolve=>finish=resolve);const start=performance.now();
  try{
   const detected=await this.landmarks.detect(bytes,{maxFaces:8}),{data,info}=await this.decode(bytes);
   if(info.channels!==3||info.width!==detected.width||info.height!==detected.height)throw Error('亮眼照片颜色或尺寸无效');
   const prepare=this.numericPrepare||(await import('./bright-eye-preparation.mjs')).prepareBrightEyeFace,faces=[];
   for(const face of detected.faces){const source={sourceRGB:data,sourceWH:[info.width,info.height],source194:Float32Array.from(face.points194.flat())},cache=prepare(source);if(cache.sides.length){if(this.extraModel){cache.extra=await this.extraModel.prepare(source);cache.version=2;}faces.push(cache);}}
   return {faces,sourceWH:[info.width,info.height],processedFaces:faces.length,detectedFaces:detected.detectedFaces,seconds:(performance.now()-start)/1000};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const results=await Promise.allSettled([this.landmarks.close(),this.extraModel?.close()]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;})();return this.closePromise;}
}
module.exports={BrightEyeService};
