'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),ort=require('onnxruntime-node');
const MODEL_SHA256='6a55faacfa5bf1e83f0a22a41d470d60bc743cb997c7db44b5fb4733aec2dc8f';
// Original restored weights, dynamic height384/512. Modern CPU execution boundary.
class LipWrinkleModels{
 constructor({file=path.join(__dirname,'assets/lip-wrinkle/1313256570.onnx'),sessionFactory=bytes=>ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1,executionMode:'sequential',graphOptimizationLevel:'disabled'})}={}){Object.assign(this,{file,sessionFactory});this.closed=false;this.running=false;}
 async session(){
  if(this.closed)throw Error('唇纹模型后端已关闭');
  if(!this.sessionPromise){const pending=(async()=>{const bytes=await fs.readFile(this.file);if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw Error('唇纹原权重校验失败，请重新解压软件');return this.sessionFactory(bytes);})();this.sessionPromise=pending;pending.catch(()=>{if(this.sessionPromise===pending)this.sessionPromise=null;});}return this.sessionPromise;
 }
 async run(input){
  if(this.closed)throw Error('唇纹模型后端已关闭');if(this.running)throw Error('唇纹模型正在处理，请稍候');
  const dims=input?.dimensions;
  if(!Array.isArray(dims)||dims.length!==4||dims[0]!==1||dims[1]!==3||![384,512].includes(dims[2])||dims[3]!==512||!(input?.data instanceof Float32Array)||input.data.length!==3*dims[2]*512||!input.data.every(Number.isFinite))throw Error('唇纹模型输入无效');
  this.running=true;let finish;this.activeJob=new Promise(r=>finish=r);
  try{const session=await this.session(),outputs=await session.run({'6':new ort.Tensor('float32',input.data,dims)}),out=outputs?.['33'],shape=[1,4,dims[2],512];if(!out||!Array.isArray(out.dims)||out.dims.length!==4||!out.dims.every((v,i)=>v===shape[i])||!(out.data instanceof Float32Array)||out.data.length!==4*dims[2]*512||!out.data.every(Number.isFinite))throw Error('唇纹模型输出无效');return out.data;}finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const s=await this.sessionPromise?.catch(()=>null);this.sessionPromise=null;if(s)await s.release();})();return this.closePromise;}
}
module.exports={LipWrinkleModels,MODEL_SHA256};
