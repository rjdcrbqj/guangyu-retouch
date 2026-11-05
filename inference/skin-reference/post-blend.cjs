'use strict';
const f=Math.fround,K=f(1/255);

function nearestEven(value){
 const lo=Math.floor(value),fraction=value-lo;
 return fraction<.5?lo:fraction>.5?lo+1:lo%2===0?lo:lo+1;
}

// 仅处理明确供应的两个BYTE表和两个ROI mask；nearest-even是调用方选定的原scalar条件。
function applySuppliedSecondaryPostBlend({source,width,height,stride,channels,ROI,mask1,mask1Stride,mask2,mask2Stride,tableA,tableB,rounding}={}){
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=32766)||width*height>80_000_000||![3,4].includes(channels)||rounding!=='nearest-even')throw TypeError('参考二次后混合照片或舍入模式无效');
 if(!(Array.isArray(ROI)||ROI instanceof Int32Array)||ROI.length!==4||!Array.from(ROI).every(Number.isSafeInteger))throw TypeError('参考二次后混合区域无效');
 const [rx,ry,rw,rh]=ROI;
 if(rx<0||ry<0||rw<1||rh<1||rw>4096||rh>4096||rx+rw>width||ry+rh>height)throw RangeError('参考二次后混合区域为空或越界');
 for(const [data,step,rows,rowBytes] of [[source,stride,height,width*channels],[mask1,mask1Stride,rh,rw],[mask2,mask2Stride,rh,rw]]){
  if(!(data instanceof Uint8Array)||!Number.isSafeInteger(step)||step<rowBytes||!Number.isSafeInteger(step*rows)||data.length<step*rows)throw TypeError('参考二次后混合缓冲无效');
 }
 if(!(tableA instanceof Uint8Array)||tableA.length!==256||!(tableB instanceof Uint8Array)||tableB.length!==256)throw TypeError('参考二次后混合需要两个256 BYTE表');
 const output=new Uint8Array(source);
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
  const w1=f(mask1[y*mask1Stride+x]*K),w2=f(mask2[y*mask2Stride+x]*K),rest=f(f(1-w1)-w2),at=(ry+y)*stride+(rx+x)*channels;
  for(let ch=0;ch<3;ch++){
   const current=source[at+ch],b=tableB[current],a=tableA[b];
   const mixed=f(f(f(current*rest)+f(a*w1))+f(b*w2));
   output[at+ch]=Math.max(0,Math.min(255,nearestEven(mixed)));
  }
 }
 return output;
}
module.exports={applySuppliedSecondaryPostBlend};
