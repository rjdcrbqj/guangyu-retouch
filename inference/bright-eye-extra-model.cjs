'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const ort=require('onnxruntime-node');
const {prepareBrightEyeExtraInput,brightEyePlane3}=require('./bright-eye-extra-preparation.cjs');
const MODEL_SHA256='f7e9c8a323098e12cf1a166ea0d1ff18c1273e2557fc3446b739049e596a8527';
// Original custom-resource V1 restored weights converted to ONNX, modernORT CPU.
// Original whole network/runtime parity is not implied by this backend.
class BrightEyeExtraModel{
 constructor({file=path.join(__dirname,'assets/models/face-skin.onnx'),sessionFactory=bytes=>ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,graphOptimizationLevel:'all'})}={}){this.file=file;this.sessionFactory=sessionFactory;this.running=false;this.closed=false;}
 async session(){
  if(this.closed)throw Error('眼部遮罩后端已关闭');
  if(!this.sessionPromise){const promise=(async()=>{const bytes=await fs.readFile(this.file);if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw Error('眼部遮罩原权重校验失败，请重新解压软件');return this.sessionFactory(bytes);})();this.sessionPromise=promise;promise.catch(()=>{if(this.sessionPromise===promise)this.sessionPromise=null;});}
  return this.sessionPromise;
 }
 async prepare(source){
  if(this.closed)throw Error('眼部遮罩后端已关闭');if(this.running)throw Error('眼部遮罩正在处理，请稍候');
  this.running=true;let finish;this.activeJob=new Promise(resolve=>finish=resolve);
  try{
   const prepared=prepareBrightEyeExtraInput(source),session=await this.session(),output=await session.run({'12':new ort.Tensor('float32',prepared.input,[1,3,256,256])}),values=output?.['39'];
   if(!values||!Array.isArray(values.dims)||values.dims.length!==4||!values.dims.every((n,i)=>n===[1,7,256,256][i]))throw Error('眼部遮罩模型输出尺寸无效');
   const plane=brightEyePlane3(values.data);
   return {plane3Base64:Buffer.from(plane).toString('base64'),projectionBits:prepared.projectionBits,normalizedBits:prepared.normalizedBits};
  }finally{this.running=false;finish();}
 }
 async close(){
  this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;if(this.sessionPromise){const session=await this.sessionPromise.catch(()=>null);this.sessionPromise=null;if(session)await session.release();}})();return this.closePromise;
 }
}
module.exports={BrightEyeExtraModel,MODEL_SHA256};
