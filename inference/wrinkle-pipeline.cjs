'use strict';
// 原1024九主区→1536二阶段→编码回贴。须提供已准备的原affine/ROI与显式native参数。
const {OriginalWrinkleModels}=require('./wrinkle-models.cjs');
const {mixRegions,effectiveStrengths,initializeOpenCV}=require('./wrinkle-regions.cjs');
const {weightedResidual,encodeResidual,warpEncodedToROI}=require('./wrinkle-postprocess.cjs');
const {resizeFloat32}=require('./opencv-runtime.cjs');
const {OriginalAuxiliaryProtection,auxiliaryDispatch}=require('./wrinkle-auxiliary.cjs');
function orderedBytes(rgb,colorOrder){if(!(rgb instanceof Uint8Array)||!['BGR','RGB'].includes(colorOrder)||rgb.length%3)throw new RangeError('模型颜色顺序无效');const out=new Uint8Array(rgb);if(colorOrder==='BGR')for(let i=0;i<out.length;i+=3){out[i]=rgb[i+2];out[i+2]=rgb[i];}return out;}
// 145bc3240: ROI-vector byte size > 0x30, stride16; 145bb1f81: original ROI max side <768.
function shouldSkipStage2({originalROIMaxSide,candidateCount}){if(!Number.isInteger(originalROIMaxSide)||originalROIMaxSide<1||!Number.isInteger(candidateCount)||candidateCount<0)throw new RangeError('原二阶段ROI门禁参数无效');return candidateCount>3&&originalROIMaxSide<768;}
class OriginalWrinklePipeline{
 constructor({models=new OriginalWrinkleModels()}={}){this.models=models;this.running=false;this.closed=false;}
 processPrepared(args){if(this.closed)return Promise.reject(new Error('祛皱后端已关闭'));if(this.activeJob)return Promise.reject(new Error('祛皱正在处理'));const job=this._processPrepared(args);this.activeJob=job;return job.finally(()=>{if(this.activeJob===job)this.activeJob=null;});}
 async _processPrepared(args){
  if(Object.hasOwn(args,'nativeProtectionFlag'))throw new RangeError('原两个区域保护开关必须分别提供，不能使用统一nativeProtectionFlag');
  const {prepared,strengths,nativeContextInt,nativeRegion7ProtectionFlag,nativeRegion9ProtectionFlag,nativeScalar358,stage2Threshold,cpuMode,auxiliary,nativeCandidateCount=1}=args;
  if(this.closed)throw new Error('祛皱后端已关闭');if(this.running)throw new Error('祛皱正在处理');
  const effective=effectiveStrengths(strengths),needsAuxiliary=strengths[3]>0||strengths[4]>0;
  if(needsAuxiliary&&(!auxiliary||!['native','excluded-diagnostic'].includes(auxiliary.mode)))throw new Error('辅助保护需要原属性条件或显式诊断排除声明');
  if(strengths[4]>0&&auxiliary.mode!=='native')throw new Error('辅助保护slot4不能被诊断声明静默忽略');
  if(auxiliary?.mode==='native')auxiliaryDispatch({...auxiliary.attributes,slot3:strengths[3],slot4:strengths[4]});
  if(!Number.isInteger(nativeContextInt)||typeof nativeRegion7ProtectionFlag!=='boolean'||typeof nativeRegion9ProtectionFlag!=='boolean'||!Number.isFinite(nativeScalar358)||!Number.isFinite(stage2Threshold)||!['scalar','avx2'].includes(cpuMode))throw new RangeError('必须提供已声明的原处理参数');
  if(!prepared||!Array.isArray(prepared.roi)||prepared.roi.length!==4||!prepared.roi.every(Number.isInteger)||prepared.roi[2]<1||prepared.roi[3]<1)throw new RangeError('必须提供有效原处理区域');
  const activeSlots=effective.map((v,i)=>v>.001&&i!==4?i:-1).filter(i=>i>=0),[,,w,h]=prepared.roi;
  const stage2Skipped=shouldSkipStage2({originalROIMaxSide:Math.max(w,h),candidateCount:nativeCandidateCount});
  const applyAuxiliary=async encoded=>auxiliary?.mode==='native'?new OriginalAuxiliaryProtection({models:this.models}).run({data:orderedBytes(prepared.photo1536,prepared.colorOrder),rawPoints194:prepared.rawPoints194,alignedPoints194:prepared.aligned194,photoFormat:prepared.colorOrder==='BGR'?0x300:0x301,forwardAffine:prepared.affine,roiWidth:w,roiHeight:h,existingProtection:auxiliary.existingProtection,attributes:auxiliary.attributes,slot3:strengths[3],slot4:strengths[4],encoded,confidence:auxiliary.confidence}):null;
  if(!activeSlots.length){let encodedNative=new Uint8Array(w*h*3).fill(80);const aux=await applyAuxiliary(encodedNative);if(aux)encodedNative=aux.encoded;return {encoded:encodedNative,encodedNative,auxiliary:aux,roi:[...prepared.roi],activeSlots,tiles:[],nativeApplicationParity:false};}
  this.running=true;
  try{
   await initializeOpenCV();const main=await this.models.main(prepared.photo1024,prepared.mask1024,{side:1024,colorOrder:prepared.colorOrder});
   const regions=mixRegions({side:1024,heads9:main.heads,mainMask:main.mainMask,points:prepared.aligned194,strengths,nativeContextInt,nativeRegion7ProtectionFlag,nativeRegion9ProtectionFlag,nativeScalar358});
   const source1024=orderedBytes(prepared.photo1024,prepared.colorOrder),source1536=orderedBytes(prepared.photo1536,prepared.colorOrder);
   const residual1024=weightedResidual({modelCHW:main.rgb,source:source1024,mixedMask:regions.mixedMask,width:1024,height:1024});
   const residual1536=resizeFloat32({data:residual1024,width:1024,height:1024,channels:3,targetWidth:1536,targetHeight:1536}),mask1536=resizeFloat32({data:regions.mixedMask,width:1024,height:1024,channels:1,targetWidth:1536,targetHeight:1536});
   const stage2=stage2Skipped?{residual:residual1536,tiles:[]}:await this.models.stage2({source:source1536,residual:residual1536,mask:mask1536,grid:main.grid,threshold:stage2Threshold});
   const encoded1536=encodeResidual({residual:stage2.residual,width:1536,height:1536,cpuMode});
   let encodedNative=warpEncodedToROI({encoded:encoded1536,width:1536,height:1536,forwardAffine:prepared.affine,roiWidth:w,roiHeight:h});const aux=await applyAuxiliary(encodedNative);if(aux)encodedNative=aux.encoded;const encoded=orderedBytes(encodedNative,prepared.colorOrder);
   return {encoded,encodedNative,auxiliary:aux,roi:[...prepared.roi],main,regions,residual1024,residual1536,mask1536,stage2Residual:stage2.residual,stage2Skipped,nativeCandidateCount,activeSlots:regions.activeSlots,tiles:stage2.tiles,colorOrder:prepared.colorOrder,nativeApplicationParity:false,limitations:['original automatic landmark/skin ROI remains independent',...(auxiliary?.mode==='excluded-diagnostic'?['native attribute-triggered auxiliary protection explicitly excluded in diagnostic']:[]),'native stage2 default threshold not recovered']};
  }finally{this.running=false;}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{if(this.activeJob)await this.activeJob.catch(()=>{});await this.models.close();})();return this.closePromise;}
}
module.exports={OriginalWrinklePipeline,orderedBytes,shouldSkipStage2};
