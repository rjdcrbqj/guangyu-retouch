'use strict';
const {SkinReferenceModels}=require('./models.cjs');
const {samplePreparedReferencePhoto}=require('./current-photo.cjs');
const {samplePreparedReferenceMask}=require('./current-mask.cjs');
const {selectSuppliedReferenceMask}=require('./mask-record.cjs');
const {multiplySuppliedMasks}=require('./mask.cjs');
const {packInputs}=require('./input.cjs');
const {applyPreparedReferenceResult}=require('./prepared-result.cjs');
const {decodeSuppliedReferencePNG64}=require('./straw-png.cjs');
const FIELDS=['original','workingPhoto','temporaryMask','referencePhoto','referenceMask','geometry','blendMask','blendMaskStride',
 'secondaryTestMask','secondaryTestMaskStride','secondaryProtection','secondaryProtectionStride','intensity','referenceRevision','colorMapRequired','secondaryPostBlend','secondaryPreparation','selectionSupply','baseMask','referencePNG'];

// structuredClone会保留SAB共享性；接受的typed供给必须再复制到私有buffer。
function detachSharedViews(value,seen=new WeakMap()){
 if(!value||typeof value!=='object')return value;
 if(seen.has(value))return seen.get(value);
 if(ArrayBuffer.isView(value)){
  const copy=value.buffer instanceof SharedArrayBuffer?
   (value instanceof DataView?new DataView(new Uint8Array(value.buffer,value.byteOffset,value.byteLength).slice().buffer):new value.constructor(value)):value;
  seen.set(value,copy);return copy;
 }
 seen.set(value,value);
 for(const key of Object.keys(value))value[key]=detachSharedViews(value[key],seen);
 return value;
}

// 全部明确供给在首await前快照；此服务不解码或制造真实provider的数据。
function snapshotRequest(r){
 if(!r||!Number.isSafeInteger(r.referenceRevision)||r.referenceRevision<0||r.startRow!==undefined||r.endRow!==undefined)
  throw TypeError('参考作业需要非负referenceRevision及完整ROI');
 const data={};for(const key of FIELDS)data[key]=r[key];
 if(r.colorMapRequired===true)data.colorMap=r.colorMap; // false分支不读payload。
 return detachSharedViews(structuredClone(data));
}

// 明确供应的原尺寸64取色PNG可直接进入打包；参考蒙版仍由独立字段供应。
function prepareReferencePhoto(j){
 if(j.referencePNG===undefined)return j.referencePhoto;
 if(j.referencePhoto!==undefined)throw TypeError('参考照片与取色PNG供应冲突');
 return decodeSuppliedReferencePNG64(j.referencePNG);
}

// 可用已供应temporaryMask，或按真实selector0/mode0组合明确供应的记录与refined base。
// 两种供给不能同时出现；缺失记录在模型前拒绝，不制造替代mask。
function prepareTemporaryMask(j){
 if(j.selectionSupply===undefined&&j.baseMask===undefined)return j.temporaryMask;
 if(j.temporaryMask!==undefined||!j.selectionSupply||!j.baseMask)throw TypeError('参考作业蒙版供给冲突或缺少base/selection记录');
 const selection=selectSuppliedReferenceMask({...j.selectionSupply,math:'native-u8-roi-copy'}),base=j.baseMask;
 if(!selection)throw Error('Reference selection mask unavailable');
 const {width,height,stride}=selection;
 if(base.width!==width||base.height!==height||(base.channels!==undefined&&base.channels!==1))throw RangeError('base与selection完整蒙版尺寸或通道不符');
 return {data:multiplySuppliedMasks({baseMask:base.data,selectionMask:selection.data,width,height,baseStride:base.stride,selectionStride:stride}),width,height,stride:width};
}

// 提交前核必需结果供给，避免已知错误仍消耗一次模型运行。
function validatePreparedFrame(j){
 const p=j.original,g=j.geometry;
 if(!p||!(p.data instanceof Uint8Array)||![p.width,p.height,p.stride].every(Number.isSafeInteger)||
  p.width<2||p.height<2||p.width>32766||p.height>32766||p.width*p.height>80000000||![3,4].includes(p.channels)||
  p.stride<p.width*p.channels||!Number.isSafeInteger(p.stride*p.height)||p.data.length<p.stride*p.height||
  g?.valid!==true||!(g.originalROI instanceof Int32Array)||g.originalROI.length!==4||
  !(g.postAffine instanceof Float32Array)||g.postAffine.length!==6||!g.postAffine.every(Number.isFinite)||
  typeof j.intensity!=='number'||!Number.isFinite(j.intensity)||!Number.isFinite(Math.fround(j.intensity)))throw TypeError('参考作业必需原frame/geometry/强度无效');
 const [x,y,w,h]=g.originalROI;
 if(x<0||y<0||w<1||h<1||w>4096||h>4096||x+w>p.width||y+h>p.height)throw RangeError('参考作业结果ROI越界');
 for(const [data,stride]of [[j.blendMask,j.blendMaskStride],[j.secondaryTestMask,j.secondaryTestMaskStride]])
  if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<w||!Number.isSafeInteger(stride*h)||data.length<stride*h)
   throw TypeError('参考作业缺少完整结果掩码');
}

// 组合两种采样、四输入模型与已准备结果；backend可以是专用模型或测试mock。
class SkinReferenceProcessor{
 constructor({models=new SkinReferenceModels()}={}){
  if(!models||typeof models.run!=='function'||typeof models.close!=='function')throw TypeError('参考作业backend接口无效');
  this.models=models;this.busy=false;this.closed=false;this.activeJob=null;this.closePromise=null;
 }
 async run(r){
  if(this.closed)throw Error('Reference processor is closed');
  if(this.busy)throw Error('Reference processor is busy');
  this.busy=true;let finish;this.activeJob=new Promise(resolve=>{finish=resolve;});
  try{
   const j=snapshotRequest(r);validatePreparedFrame(j);
   const reference=prepareReferencePhoto(j);
   const photo=samplePreparedReferencePhoto({photo:j.workingPhoto,geometry:j.geometry});
   const currentMask=samplePreparedReferenceMask({mask:prepareTemporaryMask(j),currentPhotoWH:[j.workingPhoto.width,j.workingPhoto.height],geometry:j.geometry,rounding:'nearest-even'});
   const input=packInputs({photo,currentMask,reference,referenceMask:j.referenceMask});
   const heads=await this.models.run(input);
   const result=applyPreparedReferenceResult({source:j.original?.data,width:j.original?.width,height:j.original?.height,stride:j.original?.stride,channels:j.original?.channels,
    geometry:j.geometry,heads,blendMask:j.blendMask,blendMaskStride:j.blendMaskStride,secondaryTestMask:j.secondaryTestMask,secondaryTestMaskStride:j.secondaryTestMaskStride,
    secondaryProtection:j.secondaryProtection,secondaryProtectionStride:j.secondaryProtectionStride,intensity:j.intensity,
    colorMapRequired:j.colorMapRequired,colorMap:j.colorMap,secondaryPostBlend:j.secondaryPostBlend,secondaryPreparation:j.secondaryPreparation});
   return {...result,referenceRevision:j.referenceRevision};
  }finally{this.busy=false;finish();}
 }
 close(){
  this.closed=true;
  if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;await this.models.close();})();
  return this.closePromise;
 }
}
module.exports={SkinReferenceProcessor};
