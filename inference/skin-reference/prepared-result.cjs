'use strict';
const {prepareReferenceHeads,applyReferenceRows}=require('./output-row.cjs');
const {scoreSuppliedReferenceDifference}=require('./secondary.cjs');
const {suppressSuppliedReferenceMask}=require('./suppression.cjs');
const {blendReferenceROI}=require('./final-blend.cjs');
const {applySuppliedSecondaryPostBlend}=require('./post-blend.cjs');
const {applySuppliedReferenceColorMap}=require('./color-map.cjs');
const {prepareSuppliedSecondaryProtectionMasks}=require('./secondary-protection.cjs');
const {prepareSuppliedSecondaryFrom512Source}=require('./secondary-source512.cjs');

// 按同一B0的处理前/处理后状态串联全ROI；保护生成与可选LUT另待供应。
function applyPreparedReferenceResult(r){
 if(!r||r.geometry?.valid!==true||!(r.geometry.originalROI instanceof Int32Array)||r.geometry.originalROI.length!==4||
  r.startRow!==undefined||r.endRow!==undefined||typeof r.intensity!=='number'||
  !Number.isFinite(r.intensity)||!Number.isFinite(Math.fround(r.intensity)))throw TypeError('参考已准备结果缺少有效几何或超出已接入流程');
 const ROI=Array.from(r.geometry.originalROI),work=prepareReferenceHeads(r.heads);
 const processed=applyReferenceRows({source:r.source,width:r.width,height:r.height,stride:r.stride,channels:r.channels,ROI,
  postAffine:r.geometry.postAffine,pixelMask:r.blendMask,maskStride:r.blendMaskStride,work});
 const [x,y,w,h]=ROI,original=new Uint8Array(w*h*3),colorMapApplied=r.colorMapRequired===true;
 let pixels=processed.processed;
 if(colorMapApplied){
  const color=r.colorMap;
  pixels=applySuppliedReferenceColorMap({source:pixels,width:w,height:h,stride:processed.stride,channels:3,
   lut:color?.lut,lutSize:color?.lutSize,lutFormat:color?.lutFormat,lutStride:color?.lutStride,
   coordinates:color?.coordinates,axis0:color?.axis0,axis1:color?.axis1,axis2:color?.axis2,rounding:color?.rounding}); // helper映射在判定和最终blend之前执行。
 }
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  const at=(y+row)*r.stride+(x+col)*r.channels;original.set(r.source.subarray(at,at+3),(row*w+col)*3);
 }
 const secondary=scoreSuppliedReferenceDifference({original,processed:pixels,mask:r.secondaryTestMask,width:w,height:h,
  originalChannels:3,processedChannels:3,originalStride:w*3,processedStride:processed.stride,maskStride:r.secondaryTestMaskStride});
 let finalMask=new Uint8Array(r.blendMask),protection,protectionStride,post,secondaryProtectionPrepared=false;
 if(secondary.trigger){
  const supplied=r.secondaryPreparation;
  if(supplied!==undefined){
   if(r.secondaryProtection!==undefined||r.secondaryProtectionStride!==undefined||r.secondaryPostBlend!==undefined)throw TypeError('二次保护prepared供给与已有mask/postblend冲突');
   let prepared;
   if(supplied?.math==='native-byte3-byte1-code1-secondary512-supplied'){
    if(supplied.sourcePhoto?.width!==w||supplied.sourcePhoto?.height!==h)throw RangeError('二次保护512源尺寸必须等于结果ROI');
    prepared=prepareSuppliedSecondaryFrom512Source(supplied);
   }else{
    if(!supplied||supplied.width!==w||supplied.height!==h)throw RangeError('二次保护直接prepared工作尺寸必须等于结果ROI');
    prepared=prepareSuppliedSecondaryProtectionMasks(supplied);
   }
   if(!prepared.available)throw Error('Reference secondary protection unavailable: '+prepared.reason);
   protection=prepared.high.data;protectionStride=prepared.high.stride;
   post={mask2:prepared.derivedLow.data,mask2Stride:prepared.derivedLow.stride,tableA:supplied.tableA,tableB:supplied.tableB,rounding:supplied.rounding};
   secondaryProtectionPrepared=true;
  }else{protection=r.secondaryProtection;protectionStride=r.secondaryProtectionStride;post=r.secondaryPostBlend;}
  finalMask=suppressSuppliedReferenceMask({mask:finalMask,protection,width:w,height:h,
   maskStride:r.blendMaskStride,protectionStride,factor:.1});
 }
 const incomingIntensity=Math.fround(r.intensity),appliedIntensity=secondary.trigger?Math.fround(incomingIntensity*.65):incomingIntensity; // 原CVTSS2SD/MULSD/CVTSD2SS。
 let output=blendReferenceROI({source:r.source,width:r.width,height:r.height,stride:r.stride,channels:r.channels,ROI,
  processed:pixels,processedStride:processed.stride,mask:finalMask,maskStride:r.blendMaskStride,intensity:appliedIntensity});
 const secondaryPostBlendApplied=secondary.trigger&&post!==undefined;
 if(secondaryPostBlendApplied){
  output=applySuppliedSecondaryPostBlend({source:output,width:r.width,height:r.height,stride:r.stride,channels:r.channels,ROI,
   mask1:protection,mask1Stride:protectionStride,mask2:post?.mask2,mask2Stride:post?.mask2Stride,
   tableA:post?.tableA,tableB:post?.tableB,rounding:post?.rounding}); // 用未修改的CV260供给，不把已削弱B0当保护源。
 }
 let changedRGBFields=0;
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  const at=(y+row)*r.stride+(x+col)*r.channels;for(let c=0;c<3;c++)if(output[at+c]!==r.source[at+c])changedRGBFields++;
 }
 return {output,ROI,changedRGBFields,secondary,finalMask,appliedIntensity,colorMapApplied,secondaryProtectionPrepared,secondaryPostBlendApplied,
  completionBoundary:secondaryPostBlendApplied?'prepared-result-with-supplied-secondary-postblend':'final-blend-segment',
  pendingSecondaryPostBlend:secondary.trigger&&!secondaryPostBlendApplied}; // 没有明确供给时仍标记待处理，不能冒充完整结果。
}
module.exports={applyPreparedReferenceResult};
