'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');

const OLD_MODEL_SHA256='bacd252fe239d27c18867753ee44cb7f5055dda9bec2ef83ac0aa95aef2325af';
const MODEL_SHA256='f6cb6f1ab61318dc624dd73c34288e2fb262f60ad6946fe536ea79d09cc19059';
// 优先使用 wrapper（在原版 all-768 前插入 Resize 使 64→768），回退到 mixed64
const DEFAULT_MODEL = require('node:fs').existsSync(path.join(__dirname,'../assets/skin-reference/reference-resize-wrapper.onnx'))
// 优先使用 wrapper（在原版 all-768 前插入 Resize 使 64→768）；回退到 mixed64。需 ORT 全量推理验证等价性后方可确认为默认模型。
    ? path.join(__dirname,'../assets/skin-reference/reference-resize-wrapper.onnx')
    : path.join(__dirname,'../assets/skin-reference/reference-mixed64-768.onnx');

// 诚实标注（phase95/phaseXX-溯源+wrapper，2026-10-19）：本模型是 mixed 64/768 候选，reference/referenceMask 固定 64×64，
// 而原版恢复的三个模型（resource 4281993929/3999285552/878746034，SHA 8da2f373…等）的 reference 输入
// 全部是 [1,3,768,768]。本产品的 64×64 是有意设计选择（非原版契约）。
// 模型来源已追溯至旧研究的 mixed-shape 候选文件：
//   D:/文件夹/codex/像素蛋糕Windows研究_2026-10-09/Ghidra分析/.../skin-unify-reference-mixed-shape-preflight-research/4281993929.mixed-shape.candidate.onnx
// 2026-10-13 基础模块独审发现默认模型路径缺失后，ROOT 将该候选复制入本工程 assets，
// 并核 SHA bacd252f…2325af。具体时刻及模型训练/恢复来源未记录。
// 但 reference 从 64×64 到 768×768 的路径等价性未证明：
// ORT 对比显示 mixed64 与 all-768 在统一 768 输入下输出不等价（coefficients 最大差 0.035，mask 最大差 0.122）。
// 原版证据记录 64→768 resize 未证明、Reference-color candidate not integrated。
// 接续者不得默认 mixed 模型等于原版行为；对齐原版需证明本模型内部 resize，或用全768恢复模型加已证实的resize重建。
const INPUTS=[
 ['photo','210',[1,3,768,768]],
 ['currentMask','116',[1,1,768,768]],
 ['reference','100',[1,3,64,64]],
 ['referenceMask','247',[1,1,64,64]]
];
const OUTPUTS=[['191','coefficients',[1,9,768,768]],['125','mask',[1,1,768,768]]];
const size=dims=>dims.reduce((a,b)=>a*b,1);

// The default dependency is loaded only when an actual session/tensor is needed.
const defaultSessionFactory=(bytes,options)=>require('onnxruntime-node').InferenceSession.create(bytes,options);
const defaultTensorFactory=(type,data,dims)=>new(require('onnxruntime-node').Tensor)(type,data,dims);

function finiteFloat32(data,count){
 return data instanceof Float32Array&&data.length===count&&data.every(Number.isFinite);
}
function strictFiniteShape(tensor,dims){
 return tensor?.type==='float32'&&Array.isArray(tensor.dims)&&tensor.dims.length===dims.length&&
  tensor.dims.every((v,i)=>v===dims[i])&&finiteFloat32(tensor.data,size(dims));
}

class SkinReferenceModels{
 constructor({file=DEFAULT_MODEL,readFile=fs.readFile,sessionFactory=defaultSessionFactory,tensorFactory=defaultTensorFactory}={}){
  Object.assign(this,{file,readFile,sessionFactory,tensorFactory});
  this.closed=false;this.running=false;this.sessionPromise=null;this.activeJob=null;this.closePromise=null;
 }

 _sessionForActiveJob(){
  if(!this.sessionPromise){
   const pending=(async()=>{
    const bytes=await this.readFile(this.file);
    if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw Error('Reference model SHA256 mismatch');
    return this.sessionFactory(bytes,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1,executionMode:'sequential',graphOptimizationLevel:'disabled'});
   })().catch(error=>{
    if(this.sessionPromise===pending)this.sessionPromise=null;
    throw error;
   });
   this.sessionPromise=pending;
  }
  return this.sessionPromise;
 }

 async run(input){
  if(this.closed)throw Error('Reference model backend is closed');
  if(this.running)throw Error('Reference model backend is busy');
  const snapshots={};
  for(const [field,,dims] of INPUTS){
   if(!finiteFloat32(input?.[field],size(dims)))throw Error(`Invalid reference input ${field}`);
   snapshots[field]=new Float32Array(input[field]);
  }
  this.running=true;
  let finish;
  this.activeJob=new Promise(resolve=>{finish=resolve;});
  try{
   const session=await this._sessionForActiveJob();
   const feeds={};
   for(const [field,name,dims] of INPUTS)feeds[name]=this.tensorFactory('float32',snapshots[field],[...dims]);
   const outputs=await session.run(feeds),result={};
   for(const [name,field,dims] of OUTPUTS){
    if(!strictFiniteShape(outputs?.[name],dims))throw Error(`Invalid reference output ${name}`);
    result[field]=outputs[name].data;
   }
   return result;
  }finally{
   this.running=false;finish();
  }
 }

 close(){
  this.closed=true;
  if(!this.closePromise)this.closePromise=(async()=>{
   await this.activeJob;
   const pending=this.sessionPromise;
   this.sessionPromise=null;
   const session=await pending?.catch(()=>null);
   if(session)await session.release();
  })();
  return this.closePromise;
 }
}
module.exports={SkinReferenceModels,MODEL_SHA256};
