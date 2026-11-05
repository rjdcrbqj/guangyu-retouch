'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),{openPublicPhoto}=require('../public-photo.cjs'),ort=require('onnxruntime-node');
const {PublicFaceDetector}=require('../public-yunet/detector.cjs');
const {portraitCrop}=require('../public-portrait-geometry.cjs');
const {cropFace66,prepareFace66,decodeFace66,reliableFace66}=require('./geometry.cjs');
const MODEL_SHA256='5aa0ab2594acaf2e1d3916a8de592cffeb1f1a7a7f778cad2f37948bff6549d1';
class PublicFaceLandmarks66{
 constructor({modelFile=path.join(__dirname,'lm_model3_opt.onnx'),detector=new PublicFaceDetector()}={}){this.modelFile=modelFile;this.detector=detector;this.closed=false;this.running=false;this.active=null;this.closing=null;this.sessionPromise=null;}
 async _session(){
  if(!this.sessionPromise)this.sessionPromise=(async()=>{const bytes=await fs.readFile(this.modelFile);if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw new Error('公开 66 点模型校验失败');return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1});})().catch(error=>{this.sessionPromise=null;throw error;});
  return this.sessionPromise;
 }
 async detect(bytes,box){
  if(this.closed)throw new Error('公开五官定位服务已关闭');if(this.running)throw new Error('正在定位五官，请稍候');
  this.running=true;let finish;this.active=new Promise(resolve=>{finish=resolve;});const start=performance.now();
  try{
   const image=openPublicPhoto(bytes),meta=await image.metadata(),rotated=meta.orientation>=5&&meta.orientation<=8,width=rotated?meta.height:meta.width,height=rotated?meta.width:meta.height;
   const crop=cropFace66(box,width,height);let verifiedBox=box;
   if(!box.keypoints){
    const context=portraitCrop(box,width,height,'skin'),png=await image.clone().rotate().extract(context).resize({width:512,height:512,fit:'inside',kernel:'linear'}).png().toBuffer();
    const {boxOverlap}=await import('../public-landmarks/geometry.mjs'),target={x:(box.x*width-context.left)/context.width,y:(box.y*height-context.top)/context.height,width:box.width*width/context.width,height:box.height*height/context.height};
    const detected=await this.detector.detect(png),candidate=detected.boxes.filter(b=>boxOverlap(b,target)>.1).sort((a,b)=>boxOverlap(b,target)-boxOverlap(a,target))[0];
    if(!candidate)throw new Error('未能可靠核对五官位置，原选区已保留');
    verifiedBox={...box,keypoints:candidate.keypoints.map(p=>({x:(context.left+p.x*context.width)/width,y:(context.top+p.y*context.height)/height}))};
   }
   const {data,info}=await image.rotate().extract(crop).flatten({background:'#000000'}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
   if(info.channels!==3)throw new Error('照片颜色格式无效');const input=prepareFace66(data,info.width,info.height),session=await this._session();
   const outputs=await session.run({input:new ort.Tensor('float32',input,[1,3,224,224])}),result=decodeFace66(outputs.output,crop,width,height);
   if(!await reliableFace66(result,verifiedBox))throw new Error('未能可靠定位嘴唇，原选区已保留，请重新框住完整脸部');
   return {...result,box:verifiedBox,seconds:(performance.now()-start)/1000};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;const session=await this.sessionPromise?.catch(()=>null);this.sessionPromise=null;await Promise.all([session?.release(),this.detector.close()]);})();return this.closing;}
}
module.exports={PublicFaceLandmarks66,MODEL_SHA256};
