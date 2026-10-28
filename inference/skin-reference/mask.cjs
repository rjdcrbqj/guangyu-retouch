'use strict';
const f=Math.fround,scale=f(1/255);

// 两个实际供应的蒙版；不以positive mask或占位图代替service来源。
function multiplySuppliedMasks({baseMask,selectionMask,width,height,baseStride,selectionStride}){
 if(![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||width*height>80_000_000)throw RangeError('参考图蒙版尺寸无效');
 if(!(baseMask instanceof Uint8Array)||!(selectionMask instanceof Uint8Array)||
  ![baseStride,selectionStride].every(v=>Number.isSafeInteger(v)&&v>=width)||
  !Number.isSafeInteger(baseStride*height)||!Number.isSafeInteger(selectionStride*height)||
  baseStride*height>baseMask.length||selectionStride*height>selectionMask.length)throw TypeError('参考图蒙版缓冲无效');
 const out=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=selectionMask[y*selectionStride+x],b=baseMask[y*baseStride+x];
  out[y*width+x]=a===0||b===0?0:Math.trunc(f(f(f(a*b)*scale)+f(.5)))&255;
 }
 return out;
}
// 仅计算companion mask的64 patch，reference photo不共用此ROI。
function referenceMaskPatchROI({ratios,currentPhotoWH,maskWH}){
 if(!(Array.isArray(ratios)||ratios instanceof Float32Array)||ratios.length!==2||!Array.from(ratios).every(v=>Number.isFinite(f(v))))throw TypeError('参考图蒙版比例无效');
 for(const [WH,minimum] of [[currentPhotoWH,2],[maskWH,1]])if(!Array.isArray(WH)||WH.length!==2||!WH.every(v=>Number.isInteger(v)&&v>=minimum&&v<=32766))throw RangeError('参考图蒙版裁剪尺寸无效');
 function axis(photoSize,maskSize,ratio){
  const value=f(f(photoSize)*f(ratio));
  if(!Number.isFinite(value)||value<-2147483648||value>=2147483648)throw RangeError('参考图蒙版裁剪超出整数转换范围');
  const origin=Math.max(32,Math.trunc(value))-32,extent=Math.min(64,photoSize-origin);
  const lo=Math.max(0,Math.min(maskSize,origin)),hi=Math.max(0,Math.min(maskSize,origin+extent));
  return [lo,Math.max(0,hi-lo)];
 }
 const [x,w]=axis(currentPhotoWH[0],maskWH[0],ratios[0]),[y,h]=axis(currentPhotoWH[1],maskWH[1],ratios[1]);
 return {ROI:Int32Array.from([x,y,w,h]),valid:w>0&&h>0};
}
module.exports={multiplySuppliedMasks,referenceMaskPatchROI};
