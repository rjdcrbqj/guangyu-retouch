'use strict';
const f=Math.fround,gain=f(1.2),table=new Uint8Array(256);
for(let i=0;i<256;i++)table[i]=Math.trunc(Math.min(255,f(f(i)*gain))); // 原表按F32乘法、上限255、截断生成。

// 检查已投影的整张BYTE1图；有效范围只到最后一行的最后一个像素。
function validate(plane,name){
 if(!plane||!(plane.data instanceof Uint8Array)||(plane.channels!==undefined&&plane.channels!==1)||
  (plane.depth!==undefined&&plane.depth!=='uint8'))throw TypeError(name+'需要BYTE1供给');
 const {width,height,stride,data}=plane;
 if(![width,height].every(v=>Number.isInteger(v)&&v>=1&&v<=32766)||width*height>80000000)
  throw RangeError(name+'尺寸超出供给范围');
 const span=(height-1)*stride+width;
 if(!Number.isSafeInteger(stride)||stride<width||!Number.isSafeInteger(span)||data.length<span)
  throw RangeError(name+'有效行范围不完整');
}

// 只实现实际供给全1画布下的条件公式；原版请求scalar1不等于已证明其填充结果。
function applySuppliedReferenceKey7Correction(request={}){
 if(request.math!=='native-byte1-key7-supplied-unit-canvas-generic'||request.rounding!=='nearest-even'||request.unmasked!==true)
  throw TypeError('key7修正需要明确unmasked generic与nearest-even声明');
 const canvas=request.unitCanvas;
 if(canvas==null)return {available:false,base:null,correction:null}; // 缺失时不得自行生成画布。
 validate(canvas,'unitCanvas');
 const {width,height}=canvas,correction=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const value=canvas.data[y*canvas.stride+x];
  if(value!==1)throw RangeError('unitCanvas必须是实际供给的全1有效画布');
  correction[y*width+x]=value; // 先保留调用方画布，padding不参与计算。
 }
 const {aggregate,key7,auxiliary}=request;
 for(const [name,plane] of [['aggregate',aggregate],['key7',key7],['auxiliary',auxiliary]]){
  validate(plane,name);
  if(plane.width!==width||plane.height!==height)throw RangeError('key7修正需要相同WH');
 }
 const base=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*width+x,k=key7.data[y*key7.stride+x],e=auxiliary.data[y*auxiliary.stride+x];
  if(k>0&&e>0)correction[at]=k; // 两个GT0比较经AND后执行masked copy。
  correction[at]=table[correction[at]];
  base[at]=Math.min(255,aggregate.data[y*aggregate.stride+x]+correction[at]);
 }
 const wrap=data=>({data,width,height,stride:width,channels:1});
 return {available:true,base:wrap(base),correction:wrap(correction)};
}
module.exports={applySuppliedReferenceKey7Correction};
