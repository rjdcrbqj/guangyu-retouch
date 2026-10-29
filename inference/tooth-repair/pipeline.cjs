'use strict';
const {resizeBytes}=require('../opencv-runtime.cjs');
const {prepareToothRepairAuxiliary}=require('./auxiliary.cjs');
const {packPreparedToothRepairInputs}=require('./input.cjs');
const {resizePreparedToothRepairOutput,decodePreparedToothRepairOutput}=require('./output.cjs');
const {composeCachedToothRepairRegion}=require('./composite.cjs');
const {choosePreparedToothQualityRect,isPreparedToothRepairEligible,isPreparedToothRepairEnabled}=require('./eligibility.cjs');
const {scorePreparedToothRepairDetail}=require('./quality.cjs');
const {selectPreparedToothLandmarks,alignPreparedToothLandmarks,clipPreparedToothRect,intersectPreparedToothRect}=require('./geometry.cjs');
const positive=values=>values.every(v=>Number.isSafeInteger(v)&&v>0);

// 147fdb400普通图像分支的已准备区域串联。人物有效性、整数ROI与保护蒙版由上游供应。
// 模型工作图固定512；关键点横纵坐标均按ROI宽度比例映射，不能分别用宽高比例。
// eligibility:{}启用原默认资格检查；未传时消费上游已确认资格的区域。
// rawRect接收上游已取整但未裁剪的区域，分别恢复资格交集与模型限幅；与rect二选一。
// 暂未覆盖原人物区域选择及另一套预览图分支；调用前初始化离线图像库。
async function processPreparedToothRepair({image,width,height,channels=3,stride=width*channels,rect,rawRect,landmarks,mask,infer,branch='scalar',eligibility,controlValue=1}){
 if(typeof infer!=='function')throw new TypeError('缺少牙齿模型供应器');
 if(![3,4].includes(channels)||!['scalar','sse41'].includes(branch)||branch==='sse41'&&channels!==3||!positive([width,height,stride,width*height*channels])||stride<width*channels||!(image instanceof Uint8Array)||image.length<(height-1)*stride+width*channels)throw new RangeError('牙齿源图、通道、行距或混合分支无效');
 if(rawRect===undefined){if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[0]+rect[2]>width||rect[1]+rect[3]>height)throw new RangeError('牙齿区域无效或越界');}else if(rect!==undefined)throw new RangeError('牙齿区域不可同时指定原始与已裁剪范围');
 if(eligibility!==undefined&&(!eligibility||typeof eligibility!=='object'||Array.isArray(eligibility)||eligibility.checkQuality!==undefined&&typeof eligibility.checkQuality!=='boolean'||eligibility.bypass!==undefined&&typeof eligibility.bypass!=='boolean'))throw new RangeError('牙齿资格规则无效');
 const region=rawRect===undefined?[...rect]:clipPreparedToothRect({rect:rawRect,width,height}),qualificationRect=rawRect===undefined?region:intersectPreparedToothRect({rect:rawRect,width,height}),[x,y,rw,rh]=region,source=Uint8Array.from(image);
 const enabled=isPreparedToothRepairEnabled(controlValue);if(rw<10||rh<10||!enabled)return source;
 const selected=selectPreparedToothLandmarks(landmarks);if(selected.length<214)throw new RangeError('牙齿关键点数量不足');
 let protection;
 if(mask){const {data,width:mw,height:mh,stride:ms=mw}=mask;if(!positive([mw,mh,ms,mw*mh])||ms<mw||!(data instanceof Uint8Array)||data.length<(mh-1)*ms+mw)throw new RangeError('牙齿保护图层尺寸或行距无效');protection={data:Uint8Array.from(data),width:mw,height:mh,stride:ms};}
 const aligned=alignPreparedToothLandmarks({landmarks:selected,rect:region});
 if(eligibility!==undefined&&eligibility.bypass!==true){
  if(qualificationRect[2]===0||qualificationRect[3]===0)return source;
  const qualificationPoints=rawRect===undefined?aligned:alignPreparedToothLandmarks({landmarks:selected,rect:qualificationRect});
  const qualityRect=choosePreparedToothQualityRect({landmarks:selected,width,height});
  if(!isPreparedToothRepairEligible({...eligibility,alignedLandmarks:qualificationPoints,qualityRect,checkQuality:false}))return source;
  if(eligibility.checkQuality!==false){const [qx,qy,qw,qh]=qualityRect,detailScore=scorePreparedToothRepairDetail({data:source.subarray(qy*stride+qx*channels),width:qw,height:qh,channels,stride});if(!isPreparedToothRepairEligible({...eligibility,alignedLandmarks:qualificationPoints,qualityRect,detailScore}))return source;}
 }
 const cropped=new Uint8Array(rw*rh*3);
 for(let row=0;row<rh;row++)for(let col=0;col<rw;col++)for(let c=0;c<3;c++)cropped[(row*rw+col)*3+c]=source[(row+y)*stride+(col+x)*channels+c];
 const pixels=resizeBytes({data:cropped,width:rw,height:rh,channels:3,targetWidth:512,targetHeight:512});
 const auxiliary=prepareToothRepairAuxiliary({landmarks:aligned}),input=packPreparedToothRepairInputs({pixels,width:512,height:512,auxiliary}),prediction=await infer(input);
 if(!prediction)throw new RangeError('牙齿模型未返回图像与作用范围');
 const grid=resizePreparedToothRepairOutput({image:prediction.image,alpha:prediction.alpha,targetWH:[rw,rh]}),cache=decodePreparedToothRepairOutput(grid);
 return composeCachedToothRepairRegion({image:source,width,height,channels,stride,rect:region,cache,mask:protection,branch});
}
// 147fdb280以dirty/valid控制重新推理。这里只复用单个人物的原始模型输出，
// 保守键由实际两个输入张量和供应器身份组成；不宣称已恢复原人物键或完整调度。
// 保护蒙版、目标区域、资格检查和合成分支每次重新处理。供应器内部状态改变时
// 调用invalidate或传dirty。缓存仅保留最近输入，失败清除旧值，并发同输入共享请求。
function createPreparedToothRepairProcessor(){
 const {createHash}=require('node:crypto');let cached=null,pending=null,generation=0;
 const invalidate=()=>{cached=null;pending=null;generation++;};
 const matches=(entry,key,provider)=>entry&&entry.key===key&&entry.provider===provider;
 return {invalidate,async process(input){
  if(typeof input?.infer!=='function')throw new TypeError('缺少牙齿模型供应器');
  if(input.dirty)invalidate();const provider=input.infer;
  const infer=async tensors=>{
   const hash=createHash('sha256');for(const t of [tensors.image,tensors.auxiliary]){hash.update(JSON.stringify(t.dims));hash.update(Buffer.from(t.data.buffer,t.data.byteOffset,t.data.byteLength));}const key=hash.digest('hex');
   if(matches(cached,key,provider))return cached.prediction;
   if(matches(pending,key,provider))return pending.promise;
   const token=++generation;cached=null;
   const promise=(async()=>{
    const result=await provider(tensors);if(!result)throw new RangeError('牙齿模型未返回图像与作用范围');
    // 验证固定模型网格，并复制供应器所有权之外的张量；不改变其浮点精度。
    const prediction=resizePreparedToothRepairOutput({image:result.image,alpha:result.alpha,targetWH:[512,512]});
    if(token===generation)cached={key,provider,prediction};return prediction;
   })();pending={key,provider,promise};
   try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
  };
  return processPreparedToothRepair({...input,infer});
 }};
}
module.exports={processPreparedToothRepair,createPreparedToothRepairProcessor};
