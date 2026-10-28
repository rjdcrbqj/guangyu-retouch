'use strict';
const f=Math.fround,K=f(1/255);

function blendReferenceROI({source,width,height,stride,channels,ROI,processed,processedStride,mask,maskStride,intensity,startRow=0,endRow=ROI?.[3]}){
 if(![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||width*height>80_000_000||![3,4].includes(channels))throw RangeError('参考图贴回照片尺寸或通道无效');
 if(!(Array.isArray(ROI)||ROI instanceof Int32Array)||ROI.length!==4||!Array.from(ROI).every(Number.isInteger))throw TypeError('参考图贴回区域无效');
 const [rx,ry,rw,rh]=ROI;
 if(rx<0||ry<0||rw<0||rh<0||rx+rw>width||ry+rh>height||rw>4096||rh>4096)throw RangeError('参考图贴回区域越界');
 if(!Number.isInteger(startRow)||!Number.isInteger(endRow)||startRow<0||endRow<startRow||endRow>rh||!Number.isFinite(intensity)||!Number.isFinite(f(intensity)))throw RangeError('参考图贴回强度或行范围无效');
 for(const [data,step,rows,rowBytes] of [[source,stride,height,width*channels],[processed,processedStride,rh,rw*3],[mask,maskStride,rh,rw]]){
  if(!(data instanceof Uint8Array)||!Number.isSafeInteger(step)||step<rowBytes||!Number.isSafeInteger(step*rows)||data.length<step*rows)throw TypeError('参考图贴回缓冲无效');
 }
 const out=Uint8Array.from(source),t=f(intensity);
 for(let y=startRow;y<endRow;y++)for(let x=0;x<rw;x++){
  const m=mask[y*maskStride+x];if(m===0)continue;
  const a=Math.min(1,Math.max(0,f(f(m*K)*t)));if(!(a>0))continue;
  const b=f(1-a),q=y*processedStride+x*3,o=(ry+y)*stride+(rx+x)*channels;
  for(let c=0;c<3;c++)out[o+c]=Math.max(0,Math.min(255,Math.trunc(f(f(out[o+c]*b)+f(processed[q+c]*a)))));
 }
 return out;
}
module.exports={blendReferenceROI};
