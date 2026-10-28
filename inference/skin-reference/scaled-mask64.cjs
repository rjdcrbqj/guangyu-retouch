'use strict';
const {scaleSuppliedReferenceMask}=require('./mask-scale.cjs');
const {prepareSuppliedReferenceMask64}=require('./mask64.cjs');

function prepareScaledSuppliedReferenceMask64(request){
 if(request===null||typeof request!=='object')throw TypeError('scaled-mask64需要明确供给参数');
 const {mask,sourcePhotoWH,ratios,rounding,math}=request;
 if(!mask||math!=='native-code1-then-code2-scalar')throw TypeError('scaled-mask64需要mask与明确组合数学声明');
 const scaled=scaleSuppliedReferenceMask({
  data:mask.data,width:mask.width,height:mask.height,stride:mask.stride,
  sourcePhotoWH,rounding,math:'native-code1-scalar'
 });
 // 该legacy字段仅承接caller的中性sourcePhotoWH，不推断照片业务身份。
 const prepared=prepareSuppliedReferenceMask64({
  mask:scaled,ratios,currentPhotoWH:Array.from(sourcePhotoWH),math:'native-code2-scalar'
 });
 return {...prepared,scale:scaled.scale,scaledWH:Int32Array.of(scaled.width,scaled.height)};
}
module.exports={prepareScaledSuppliedReferenceMask64};
