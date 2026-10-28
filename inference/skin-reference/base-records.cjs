'use strict';
const {warpByte}=require('../skin-unify/lib/byte-warp.cjs');
const signedDimension=n=>Number.isInteger(n)&&n>=-32766&&n<=32766;

// 144e5dac0已选择的描述记录→全画布BYTE1饱和和；尚未经过photo相关base精修。
// 仅支持明确generic/nearest-even路径。缺失图像不制造默认零base。
function combineSuppliedReferenceBaseRecords({records,math,rounding}={}){
 if(!Array.isArray(records)||records.length>10000||math!=='native-byte1-affine-add-generic'||rounding!=='nearest-even')
  throw TypeError('base组合需要明确记录、generic BYTE1数学与nearest-even');
 for(const r of records)if(!r||!Array.isArray(r.fullWH)||r.fullWH.length!==2||!r.fullWH.every(signedDimension))throw RangeError('base记录fullWH无效');
 let width=0,height=0;
 for(const r of records){if(r.fullWH[0]>0)width=r.fullWH[0];if(r.fullWH[1]>0)height=r.fullWH[1];if(width>0&&height>0)break;}
 if(width<1||height<1)return null;
 if(width*height>80000000)throw RangeError('base完整画布超出支持范围');
 let out=null;
 for(const r of records){
  if(r.image==null)continue;
  if(r.fullWH[0]!==width||r.fullWH[1]!==height)throw RangeError('base参与图的fullWH与所选画布不同');
  const {data,width:w,height:h,stride,channels}=r.image;
  if(!(data instanceof Uint8Array)||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>32766||h>32766||w*h>80000000||
   (channels!==undefined&&channels!==1)||!Number.isSafeInteger(stride)||stride<w||!Number.isSafeInteger((h-1)*stride+w)||data.length<(h-1)*stride+w)
   throw TypeError('base记录需要有效BYTE1与独立stride');
  if(!Array.isArray(r.origin)||r.origin.length!==2||!r.origin.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=-32766&&v<=32766))
   throw RangeError('base平移超出已验证DOUBLE转INT32范围');
  const packed=new Uint8Array(w*h);
  for(let row=0;row<h;row++)packed.set(data.subarray(row*stride,row*stride+w),row*w);
  const tx=Math.fround(Math.trunc(r.origin[0])),ty=Math.fround(Math.trunc(r.origin[1])); // 原CVTTSD2SI后CVTSI2SS顺序。
  const plane=warpByte(packed,w,h,Float32Array.of(1,0,tx,0,1,ty),width,height,1);
  if(out===null)out=plane;
  else for(let n=0;n<out.length;n++)out[n]=Math.min(255,out[n]+plane[n]);
 }
 return out===null?null:{data:out,width,height,stride:width};
}
module.exports={combineSuppliedReferenceBaseRecords};
