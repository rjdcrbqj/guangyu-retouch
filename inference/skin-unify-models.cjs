'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),ort=require('onnxruntime-node');
const MODEL_SHA256=Object.freeze(['0ace624846200db14fe456f42aab7382bb9e914363e2fff497b0feafa20ec14c','cb1db7213b1565d6402cca0cabf2311055e56b3dc8626b5229b70f784636b858']);
const AREA=384*384;
// 原恢复权重由现代CPU执行；不声称原完整神经网络调度一致。
class SkinUnifyModels{
 constructor({files=[0,1].map(k=>path.join(__dirname,`assets/skin-unify/key${k}.onnx`)),sessionFactory=bytes=>ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1,executionMode:'sequential',graphOptimizationLevel:'disabled'})}={}){Object.assign(this,{files,sessionFactory});this.sessions=[];this.closed=false;this.running=false;}
 async _sessionForActiveJob(key){
  if(!this.sessions[key]){const pending=(async()=>{const bytes=await fs.readFile(this.files[key]);if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256[key])throw Error('肤色统一原权重校验失败，请重新解压软件');return this.sessionFactory(bytes);})();this.sessions[key]=pending;pending.catch(()=>{if(this.sessions[key]===pending)this.sessions[key]=null;});}return this.sessions[key];
 }
 async run(key,input){
  if(this.closed)throw Error('肤色统一模型后端已关闭');if(this.running)throw Error('肤色统一模型正在处理，请稍候');
  if(key!==0&&key!==1)throw Error('肤色统一模型key无效');if(!(input instanceof Float32Array)||input.length!==3*768*768||!input.every(Number.isFinite))throw Error('肤色统一模型输入无效');
  this.running=true;let finish;this.activeJob=new Promise(r=>finish=r);
  try{const session=await this._sessionForActiveJob(key),outputs=await session.run({'6':new ort.Tensor('float32',input,[1,3,768,768])}),result={};
   for(const [name,c,field] of [['51',1,'head1'],['21',3,'head3'],['9',9,'head9']]){const out=outputs?.[name],dims=[1,c,384,384];if(!out||!Array.isArray(out.dims)||out.dims.length!==4||!out.dims.every((v,i)=>v===dims[i])||!(out.data instanceof Float32Array)||out.data.length!==c*AREA||!out.data.every(Number.isFinite))throw Error(`肤色统一模型输出${name}无效`);result[field]=out.data;}return result;
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const pending=this.sessions;this.sessions=[];await Promise.all(pending.map(async p=>{const s=await p?.catch(()=>null);if(s)await s.release();}));})();return this.closePromise;}
}
module.exports={SkinUnifyModels,MODEL_SHA256};
