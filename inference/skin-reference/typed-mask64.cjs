'use strict';
const {combineSuppliedReferenceBaseRecords}=require('./base-records.cjs');
const {subtractSuppliedReferenceMasks}=require('./mask-subtract.cjs');
const {prepareScaledSuppliedReferenceMask64}=require('./scaled-mask64.cjs');
const ADDITIONAL_KEYS=[6,7,8,9,10,11,12,13,4,3,5];

// 147d38660的参考companion来源：全部typed聚合，条件下减aux1；不使用selection key0。
// generic/unmasked为caller的明确条件，sourcePhotoWH/ratios不由本模块猜测。
function prepareSuppliedTypedReferenceMask64(request={}){
 const {typedMasks,math,rounding,unmasked}=request;
 if(!(typedMasks instanceof Map)||math!=='native-byte1-add-subtract-code1-code2-generic'||rounding!=='nearest-even'||unmasked!==true)
  throw TypeError('typed参考蒙版需要明确Map、unmasked generic数学及nearest-even');
 const records=[],first=typedMasks.get(2);let key7Active=false;
 if(first!=null)records.push(first); // 原[2]总是进入初始列表，保留其metadata参与WH选择。
 for(const key of ADDITIONAL_KEYS){const r=typedMasks.get(key);if(r?.image!=null){records.push(r);if(key===7)key7Active=true;}}
 const combine=list=>combineSuppliedReferenceBaseRecords({records:list,math:'native-byte1-affine-add-generic',rounding});
 const aggregate=combine(records);
 if(aggregate===null)return {available:false,valid:false,mask:null,source:null};
 let mask=aggregate,source='aggregate';
 const auxiliaryRecord=typedMasks.get(1),auxiliary=auxiliaryRecord?.image!=null?combine([auxiliaryRecord]):null;
 if(auxiliary!==null&&(aggregate.width!==auxiliary.width||aggregate.height!==auxiliary.height)&&key7Active)
  throw RangeError('aux1异尺寸且key7修正路径尚未闭合'); // 原后段仍可能更新借用Native718，不能假设fallback为原聚合。
 if(auxiliary!==null&&aggregate.width===auxiliary.width&&aggregate.height===auxiliary.height){
  mask=subtractSuppliedReferenceMasks({left:aggregate,right:auxiliary,math:'native-u8-saturating-subtract-generic'});
  source='aggregate-minus-auxiliary';
 }
 const prepared=prepareScaledSuppliedReferenceMask64({mask,sourcePhotoWH:request.sourcePhotoWH,ratios:request.ratios,rounding,math:'native-code1-then-code2-scalar'});
 return {...prepared,available:true,source};
}
module.exports={prepareSuppliedTypedReferenceMask64};
