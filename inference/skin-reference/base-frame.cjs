'use strict';
const {resizeSuppliedReferenceBaseSquare}=require('./base-resize.cjs');
const {refineSuppliedSquareReferenceBase}=require('./base-square.cjs');
const {combineSuppliedReferenceBaseRecords}=require('./base-records.cjs');

// 真实provider供应两个frame；两者先独立resize，再以同square ROI细化。
function refineSuppliedReferenceBase(request={}){
 const {photo,mask,rounding}=request;
 if(!photo||![300,301].includes(photo.format)||(photo.channels!==undefined&&photo.channels!==3)||!mask||(mask.channels!==undefined&&mask.channels!==1))
  throw TypeError('base供给需要明确physical BYTE3照片与mono mask');
 const side=Math.min(photo.width,photo.height,1500);
 const guide=resizeSuppliedReferenceBaseSquare({...photo,channels:3,side,rounding});
 const selection=resizeSuppliedReferenceBaseSquare({...mask,channels:1,side,rounding});
 const result=refineSuppliedSquareReferenceBase({guide:guide.data,mask:selection.data,side,rounding,
  get range(){return request.range;},get spatial(){return request.spatial;}});
 return {...result,side};
}
// 明确记录先投影累积，再复用完整frame精修；无图像时不读取尚不可用的照片/权重。
function refineSuppliedReferenceBaseRecords(request={}){
 const mask=combineSuppliedReferenceBaseRecords({records:request.records,math:request.math,rounding:request.rounding});
 if(mask===null)return null;
 return refineSuppliedReferenceBase({photo:request.photo,mask,rounding:request.rounding,
  get range(){return request.range;},get spatial(){return request.spatial;}});
}
module.exports={refineSuppliedReferenceBase,refineSuppliedReferenceBaseRecords};
