'use strict';
const f=Math.fround;
function dimensions(WH){
 if(!Array.isArray(WH)||WH.length!==2||!WH.every(v=>Number.isInteger(v)&&v>=2&&v<=32766))throw TypeError('参考图几何尺寸无效');
 return WH;
}
function int32(value){
 if(!Number.isInteger(value)||value<-2147483648||value>2147483647)throw RangeError('参考图几何超出整数运算范围');return value;
}
function cvtt(value){
 if(!Number.isFinite(value)||value<-2147483648||value>=2147483648)throw RangeError('参考图几何超出整数转换范围');return Math.trunc(value);
}
const clamp=(value,max)=>Math.max(0,Math.min(max,value));

// 保持原[top,left,bottom,right]顺序及top的非对称钳制行为。
function expandReferenceBounds({bounds,fullWH,padding=.125}){
 const [W,H]=dimensions(fullWH);
 if(!(Array.isArray(bounds)||bounds instanceof Float32Array)||bounds.length!==4||!Array.from(bounds).every(v=>Number.isFinite(f(v)))||!Number.isFinite(f(padding)))throw TypeError('参考图归一边界或扩展值无效');
 const [top,left,bottom,right]=Array.from(bounds,f),e=f(f(padding)+1);
 let t=cvtt(f(top*f(H))),l=cvtt(f(left*f(W))),r=cvtt(f(f(W)*right)),b=cvtt(f(bottom*f(H)));
 t=clamp(t,W-1);r=clamp(r,W-1);t=clamp(t,H-1);b=clamp(b,H-1);
 const rw=cvtt(f(f(int32(r-l))*e)),rh=cvtt(f(f(int32(b-t))*e));
 const rawX=int32(Math.trunc(int32(r+l)/2)-Math.trunc(rw/2));
 const rawY=int32((int32(t+b)>>>1)-Math.trunc(rh/2));
 const x=clamp(rawX,W-1),y=clamp(rawY,H-1),x2=clamp(int32(rawX+rw),W-1),y2=clamp(int32(rawY+rh),H-1);
 const ROI=Int32Array.from([x,y,x2-x,y2-y]);return {ROI,valid:ROI[2]>10&&ROI[3]>10};
}

// 原compact矩阵重排成descriptor的row6，不使用人脸fit或乘0.5。
function referenceAffine({ROI,modelWH=[768,768]}){
 const [mw,mh]=dimensions(modelWH);
 if(!(Array.isArray(ROI)||ROI instanceof Int32Array)||ROI.length!==4||!Array.from(ROI).every(Number.isInteger)||ROI[0]<0||ROI[1]<0||ROI[2]<1||ROI[3]<1||Array.from(ROI).some(v=>v>32766))throw TypeError('参考图仿射区域无效');
 const s=f(f(Math.max(mw,mh))/f(Math.max(ROI[2],ROI[3])));
 const mx=f(Math.trunc(mw/2)),my=f(Math.trunc(mh/2)),dx=-f(int32(ROI[0]+Math.trunc(ROI[2]/2))),dy=-f(int32(ROI[1]+Math.trunc(ROI[3]/2)));
 const tx=f(mx+f(f(0*dy)+f(s*dx))),ty=f(my+f(f(0*dx)+f(s*dy)));
 return Float32Array.from([s,0,tx,0,s,ty]);
}

// 两个显式输入蒙版决定边界；基底和selection实际供应由上层完成。
function scanNormalizedBounds({baseMask,selectionMask,width,height,baseStride,selectionStride}){
 dimensions([width,height]);
 if(!(baseMask instanceof Uint8Array)||!(selectionMask instanceof Uint8Array)||
  ![baseStride,selectionStride].every(v=>Number.isSafeInteger(v)&&v>=width)||baseStride*height>baseMask.length||selectionStride*height>selectionMask.length)throw TypeError('参考图边界蒙版缓冲无效');
 let minX=width,minY=height,maxX=0,maxY=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(baseMask[y*baseStride+x]!==0&&selectionMask[y*selectionStride+x]>20){
  minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
 }
 const ix=f(1/f(width)),iy=f(1/f(height));
 return Float32Array.from([f(f(minY-1)*iy),f(f(minX-1)*ix),f(iy*f(maxY+1)),f(ix*f(maxX+1))]);
}

// working resize只改变采样仿射，输出仿射始终对原图绝对坐标。
function prepareReferenceGeometry({normBounds,originalWH,workingWH=originalWH,resizeWorking=false,padding=.125,modelWH=[768,768]}){
 if(typeof resizeWorking!=='boolean')throw TypeError('参考图工作尺寸模式无效');
 dimensions(originalWH);dimensions(workingWH);dimensions(modelWH);
 const original=expandReferenceBounds({bounds:normBounds,fullWH:originalWH,padding});
 const working=resizeWorking?expandReferenceBounds({bounds:normBounds,fullWH:workingWH,padding}):{ROI:original.ROI.slice(),valid:original.valid};
 const valid=original.valid&&working.valid;
 return {originalROI:original.ROI,workingROI:working.ROI,valid,
  inputForward:valid?referenceAffine({ROI:working.ROI,modelWH}):null,
  postAffine:valid?referenceAffine({ROI:original.ROI,modelWH}):null};
}
module.exports={expandReferenceBounds,referenceAffine,scanNormalizedBounds,prepareReferenceGeometry};
