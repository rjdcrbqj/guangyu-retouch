'use strict';
const {applySuppliedReferenceKey7Correction}=require('./key7-correction.cjs');
const {refineSuppliedReferenceBase}=require('./base-frame.cjs');

// 对应修正图送packet+270、更新后的total送packet+1e8之前的两次独立精修。
// 输入必须由真实provider明确供应；本模块不把typed主集合猜作total来源。
function refineSuppliedReferenceKey7Frames(request={}){
 const corrected=applySuppliedReferenceKey7Correction(request);
 if(!corrected.available)return corrected;
 const photo=request.photo,rounding=request.rounding;
 const refine=mask=>refineSuppliedReferenceBase({photo,mask,rounding,
  get range(){return request.range;},get spatial(){return request.spatial;}});
 const correction=refine(corrected.correction); // 原修正图先精修，不能与total合成一个保护输出。
 const base=refine(corrected.base);
 return {available:true,base,correction};
}
module.exports={refineSuppliedReferenceKey7Frames};
