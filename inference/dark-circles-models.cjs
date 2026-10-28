'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),ort=require('onnxruntime-node');
// Original weight-loader arithmetic and deconvolution resource layout verified.
// Inference uses modern ORT; whole original neural backend parity is unproved.
const MODEL_SPEC=Object.freeze({file:'1786678545.onnx',sha256:'e90687992ff8f35390993b5d6916d8f3470828b18262b46a838f71b95a08dd10',shape:Object.freeze([1,3,384,384]),input:'57',corrected:'9',mask:'69'});
function checkOutput(tensor,shape){
 if(!tensor||!Array.isArray(tensor.dims)||tensor.dims.length!==shape.length||!tensor.dims.every((n,i)=>n===shape[i])||!(tensor.data instanceof Float32Array)||tensor.data.length!==shape.reduce((a,b)=>a*b,1)||!tensor.data.every(Number.isFinite))throw Error('祛黑眼圈模型输出无效');
 return tensor.data;
}
class DarkCirclesModels{
 constructor({directory=path.join(__dirname,'assets/dark-circles'),sessionFactory:factory=bytes=>ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,executionMode:'sequential',graphOptimizationLevel:'disabled'})}={}){this.directory=directory;this.sessionFactory=factory;this.running=false;this.closed=false;}
 async _sessionForActiveJob(){
  if(!this.sessionPromise){
   const pending=(async()=>{const bytes=await fs.readFile(path.join(this.directory,MODEL_SPEC.file));if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SPEC.sha256)throw Error('祛黑眼圈原权重校验失败，请重新解压软件');return this.sessionFactory(bytes);})();
   this.sessionPromise=pending;pending.catch(()=>{if(this.sessionPromise===pending)this.sessionPromise=null;});
  }return this.sessionPromise;
 }
 async run(side,input){
  if(this.closed)throw Error('祛黑眼圈模型后端已关闭');if(this.running)throw Error('祛黑眼圈模型正在处理，请稍候');
  if(!['left','right'].includes(side))throw Error('祛黑眼圈模型区域无效');
  if(!(input?.data instanceof Float32Array)||input.data.length!==442368||!input.data.every(Number.isFinite)||!Array.isArray(input.dimensions)||input.dimensions.length!==4||!input.dimensions.every((n,i)=>n===MODEL_SPEC.shape[i]))throw Error('祛黑眼圈模型输入无效');
  this.running=true;let finish;this.activeJob=new Promise(resolve=>finish=resolve);
  try{const session=await this._sessionForActiveJob(),out=await session.run({[MODEL_SPEC.input]:new ort.Tensor('float32',input.data,MODEL_SPEC.shape)});return {corrected:checkOutput(out?.[MODEL_SPEC.corrected],[1,3,384,384]),mask:checkOutput(out?.[MODEL_SPEC.mask],[1,1,384,384])};}
  finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const session=await this.sessionPromise?.catch(()=>null);this.sessionPromise=null;if(session)await session.release();})();return this.closePromise;}
}
module.exports={DarkCirclesModels,MODEL_SPEC};
