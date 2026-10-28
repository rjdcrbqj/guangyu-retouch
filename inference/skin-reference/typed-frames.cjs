'use strict';
const {combineSuppliedReferenceBaseRecords}=require('./base-records.cjs');
const {subtractSuppliedReferenceMasks}=require('./mask-subtract.cjs');
const {applySuppliedReferenceKey7Correction}=require('./key7-correction.cjs');
const {refineSuppliedReferenceBase}=require('./base-frame.cjs');
const MAIN_KEYS=[6,7,8,9,10,11,12,13],EXTRA_KEYS=[4,3,5];
const unavailable=()=>({available:false,packet160:null,packet270:null,packet1e8:null});
const sameWH=(a,b)=>a.width===b.width&&a.height===b.height;

// 已解码typed Map到独立三路精修；不产生真实服务数据、默认权重或原生ones画布。
function prepareSuppliedTypedReferenceFrames(request={}){
 const {typedMasks,rounding}=request;
 if(!(typedMasks instanceof Map)||request.math!=='native-byte1-typed-frames-supplied-unit-canvas-generic'||
  rounding!=='nearest-even'||request.unmasked!==true)throw TypeError('typed frames需要明确Map、unmasked generic与nearest-even');
 const totalRecords=[],mainRecords=[],first=typedMasks.get(2);let key7Record=null;
 if(first!=null)totalRecords.push(first);
 for(const key of MAIN_KEYS){
  const r=typedMasks.get(key);
  if(r?.image!=null){mainRecords.push(r);totalRecords.push(r);if(key===7)key7Record=r;}
 }
 for(const key of EXTRA_KEYS){const r=typedMasks.get(key);if(r?.image!=null)totalRecords.push(r);}
 const combine=records=>combineSuppliedReferenceBaseRecords({records,rounding,math:'native-byte1-affine-add-generic'});
 let total=combine(totalRecords);
 if(total===null)return unavailable();
 let main=combine(mainRecords),correction=null;
 const auxiliaryRecord=typedMasks.get(1),auxiliary=auxiliaryRecord?.image!=null?combine([auxiliaryRecord]):null;
 if(auxiliary!==null){ // 原3977c/397a3外层门：无aux时整个key7分支跳过。
  if(key7Record!==null&&!sameWH(total,auxiliary))throw RangeError('aux1异尺寸且key7分支尚不支持');
  if(main!==null&&sameWH(main,auxiliary))main=subtractSuppliedReferenceMasks({left:main,right:auxiliary,math:'native-u8-saturating-subtract-generic'});
  if(key7Record!==null){
   const corrected=applySuppliedReferenceKey7Correction({aggregate:total,key7:combine([key7Record]),auxiliary,
    unitCanvas:request.unitCanvas,rounding,unmasked:true,math:'native-byte1-key7-supplied-unit-canvas-generic'});
   if(!corrected.available)return unavailable();
   total=corrected.base;correction=corrected.correction;
  }
 }
 const photo=request.photo;
 const refine=(mask,which)=>mask===null?null:refineSuppliedReferenceBase({photo,mask,rounding,
  get range(){return request[which]?.range;},get spatial(){return request[which]?.spatial;}});
 const packet270=refine(correction,'weightsFull'); // 保留原顺序和各自bbox无写门。
 const packet160=refine(main,'weightsMain');
 const packet1e8=refine(total,'weightsFull');
 return {available:true,packet160,packet270,packet1e8};
}
module.exports={prepareSuppliedTypedReferenceFrames};
