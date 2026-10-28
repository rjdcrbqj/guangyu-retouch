'use strict';
const f=Math.fround; // 明确roundNearest候选；原线程MXCSR尚未观测。
const prepare=new Uint8Array(256),finish=new Uint8Array(256);
for(let i=0;i<256;i++){
 prepare[i]=Math.trunc(Math.min(255,f(f(i)*f(1.2)))); // 原表先F32乘法，再饱和并截断。
 finish[i]=i<100?0:Math.trunc(f(f(i-100)*f(1.6451612710952759))); // 原第二表阈值100，无加半舍入。
}

// 独立应用原基础裁剪的一张表；两张表之间的滤波由后续供应负责。
function applyReferenceBaseLUT(r){
 if(!r)throw TypeError('基础掩码查表参数不完整');
 const {data,width,height,stride,stage}=r;
 if(!(data instanceof Uint8Array)||![width,height].every(v=>Number.isInteger(v)&&v>=5&&v<=1500)||
  !Number.isSafeInteger(stride)||stride<width||!Number.isSafeInteger(stride*height)||data.length<stride*height||
  !['prepare','finish'].includes(stage))throw TypeError('基础掩码查表缓冲或阶段无效');
 const table=stage==='prepare'?prepare:finish,mask=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)mask[y*width+x]=table[data[y*stride+x]];
 return {mask,width,height,stride:width};
}
module.exports={applyReferenceBaseLUT};
