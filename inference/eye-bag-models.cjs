'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),ort=require('onnxruntime-node');
// Original FLOAT weight-loader arithmetic and resource layout verified; modern CPU inference is an explicit
// boundary. Original whole neural backend/runtime parity has not been established.
const MODEL_SPECS=Object.freeze({
 primary:Object.freeze({file:'814444604.onnx',sha256:'c6ef377dc6e7f08528e0db6ee1bb21a139e939c50791a21cecb59955516e9821',shape:[1,3,384,512],input:'39',mask:'15',corrected:'41'}),
 secondary:Object.freeze({file:'4030703027.onnx',sha256:'12d87624e09cb81793628159fd2f66e9aa002f216d01f2a35d8fa746aa12cee2',shape:[1,3,128,384],input:'126',mask:'28'}),
});
function checkOutput(tensor,shape){
 if(!tensor||!Array.isArray(tensor.dims)||tensor.dims.length!==shape.length||!tensor.dims.every((n,i)=>n===shape[i])||!(tensor.data instanceof Float32Array)||tensor.data.length!==shape.reduce((a,b)=>a*b,1)||!tensor.data.every(Number.isFinite))throw Error('去眼袋模型输出无效');
 return tensor.data;
}
class EyeBagModels{
 constructor({directory=path.join(__dirname,'assets/eye-bag-corrected'),sessionFactory=(_role,bytes)=>ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,executionMode:'sequential',graphOptimizationLevel:'disabled'})}={}){this.directory=directory;this.sessionFactory=sessionFactory;this.sessions=new Map();this.running=false;this.closed=false;}
 async session(role){
  if(this.closed)throw Error('去眼袋模型后端已关闭');const spec=MODEL_SPECS[role];if(!spec)throw Error('去眼袋模型类型无效');
  if(!this.sessions.has(role)){
   const promise=(async()=>{const bytes=await fs.readFile(path.join(this.directory,spec.file));if(createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw Error('去眼袋原权重校验失败，请重新解压软件');return this.sessionFactory(role,bytes);})();
   this.sessions.set(role,promise);promise.catch(()=>{if(this.sessions.get(role)===promise)this.sessions.delete(role);});
  }
  return this.sessions.get(role);
 }
 async run(part,input){
  if(this.closed)throw Error('去眼袋模型后端已关闭');if(this.running)throw Error('去眼袋模型正在处理，请稍候');
  if(!['left','right','secondary'].includes(part))throw Error('去眼袋模型区域无效');
  const role=part==='secondary'?'secondary':'primary',spec=MODEL_SPECS[role];
  if(!(input?.data instanceof Float32Array)||input.data.length!==spec.shape.reduce((a,b)=>a*b,1)||!input.data.every(Number.isFinite)||!Array.isArray(input.dimensions)||input.dimensions.length!==4||!input.dimensions.every((n,i)=>n===spec.shape[i]))throw Error('去眼袋模型输入无效');
  this.running=true;let finish;this.activeJob=new Promise(resolve=>finish=resolve);
  try{
   const session=await this.session(role),out=await session.run({[spec.input]:new ort.Tensor('float32',input.data,spec.shape)}),[,,h,w]=spec.shape;
   const mask=checkOutput(out?.[spec.mask],[1,1,h,w]);
   return {backendStatus:0,mask,...(spec.corrected?{corrected:checkOutput(out?.[spec.corrected],[1,3,h,w])}:{})};
  }finally{this.running=false;finish();}
 }
 async close(){
  this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{
   await this.activeJob;const sessions=await Promise.allSettled(this.sessions.values());this.sessions.clear();
   const results=await Promise.allSettled(sessions.filter(s=>s.status==='fulfilled').map(s=>s.value.release()));const failed=results.find(s=>s.status==='rejected');if(failed)throw failed.reason;
  })();return this.closePromise;
 }
}
module.exports={EyeBagModels,MODEL_SPECS};
