'use strict';
const {warpByte}=require('../skin-unify/lib/byte-warp.cjs');
const {inverse,roundEven}=require('../skin-unify/lib/coordinates.cjs');
const f=Math.fround,SIDE=768;
const dimensions=(w,h)=>Number.isInteger(w)&&Number.isInteger(h)&&w>=2&&h>=2&&w<=32766&&h<=32766&&w*h<=80000000;

// 原flags0 small3x3使用逐F32点积，最后DOUBLE加正零归一符号。
function composeReferenceMaskForward({inputForward,photoWidth,photoHeight,maskWidth,maskHeight,rounding}={}){
 if(rounding!=='nearest-even'||!dimensions(photoWidth,photoHeight)||!dimensions(maskWidth,maskHeight)||
  !(inputForward instanceof Float32Array)||inputForward.length!==6||!inputForward.every(Number.isFinite))throw TypeError('模型mask forward需要有限F32矩阵、明确WH和nearest-even');
 const sx=f(f(photoWidth)/f(maskWidth)),sy=f(f(photoHeight)/f(maskHeight)),diagonal=[sx,sy,1],out=new Float32Array(6);
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){
  const products=[0,1,2].map(k=>f(inputForward[row*3+k]*(k===col?diagonal[col]:0)));
  const sum=f(products[2]+f(products[0]+products[1]));
  out[row*3+col]=f(sum+0); // DOUBLE alpha1 + emptyC正零*beta1，非省略零项的快算。
 }
 if(!out.every(Number.isFinite))throw RangeError('模型mask矩阵超出有限组成域');
 return out;
}

// 检查copied warp的固定点参数，限制到无INT32溢出的明确有限域。
function checkFixedPoint(forward){
 const m=inverse(Array.from(forward));
 if(!m.every(Number.isFinite))throw RangeError('模型mask逆矩阵非有限');
 const bounded=v=>{if(!Number.isSafeInteger(v)||v<=-2147483648||v>=2147483648)throw RangeError('模型mask固定点超出已验证INT32域');return v;};
 const dx=[0,SIDE-1].map(x=>bounded(roundEven(m[0]*x*1024))),dy=[0,SIDE-1].map(x=>bounded(roundEven(m[3]*x*1024)));
 const ox=[0,SIDE-1].map(y=>bounded(bounded(roundEven((m[1]*y+m[2])*1024))+16)),oy=[0,SIDE-1].map(y=>bounded(bounded(roundEven((m[4]*y+m[5])*1024))+16));
 for(const [delta,origin]of [[dx,ox],[dy,oy]])for(const a of delta)for(const b of origin)bounded(a+b);
}

// 已供应selection×base临时mono BYTE，边缘按原BYTEwarp零邻居插值。
function samplePreparedReferenceMask({mask,currentPhotoWH,geometry,rounding}={}){
 if(!mask||!(mask.data instanceof Uint8Array)||!dimensions(mask.width,mask.height)||
  !Number.isSafeInteger(mask.stride)||mask.stride<mask.width||!Number.isSafeInteger(mask.stride*mask.height)||mask.data.length<mask.stride*mask.height||
  !Array.isArray(currentPhotoWH)||currentPhotoWH.length!==2||geometry?.valid!==true)throw TypeError('模型mask缺少已供应mono BYTE和working几何');
 const forward=composeReferenceMaskForward({inputForward:geometry.inputForward,photoWidth:currentPhotoWH[0],photoHeight:currentPhotoWH[1],maskWidth:mask.width,maskHeight:mask.height,rounding});
 checkFixedPoint(forward);
 const packed=new Uint8Array(mask.width*mask.height);
 for(let y=0;y<mask.height;y++)packed.set(mask.data.subarray(y*mask.stride,y*mask.stride+mask.width),y*mask.width);
 return {data:warpByte(packed,mask.width,mask.height,forward,SIDE,SIDE,1),width:SIDE,height:SIDE,stride:SIDE,forward};
}
module.exports={composeReferenceMaskForward,samplePreparedReferenceMask};
