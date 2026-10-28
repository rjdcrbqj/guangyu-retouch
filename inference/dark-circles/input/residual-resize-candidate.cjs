'use strict';
const native=require('./lib/float-resize.cjs');
function resizeResidual({residual384,squareWH,paddingTopBottomLeftRight,originalCropRect}){
 if(!(residual384 instanceof Float32Array)||residual384.length!==384*384*3||!residual384.every(Number.isFinite))throw new TypeError('finite384HWC3F32 residual');
 if(!Array.isArray(squareWH)||squareWH.length!==2||!squareWH.every(v=>Number.isInteger(v)&&v>0&&v<=4096))throw new RangeError('explicit squareWH');
 const [w,h]=squareWH;if(w!==h)throw new RangeError('original padded square');const p=paddingTopBottomLeftRight;
 if(!Array.isArray(p)||p.length!==4||!p.every(v=>Number.isInteger(v)&&v>=0))throw new RangeError('paddingTBLR');
 const [top,bottom,left,right]=p,roi=[left,top,w-left-right,h-top-bottom];
 if(roi[2]<=0||roi[3]<=0)throw new RangeError('nonempty unpaddedROI');
 if(!Array.isArray(originalCropRect)||originalCropRect.length!==4||!originalCropRect.every(Number.isInteger)||originalCropRect[2]!==roi[2]||originalCropRect[3]!==roi[3])throw new RangeError('originalCropRect WH must match unpaddedROI');
 const resized=native.resize(residual384,384,384,w,h,3),cropped=new Float32Array(roi[2]*roi[3]*3);
 // No arithmetic in crop: retain every F32 bit, including signedzero.
 for(let y=0;y<roi[3];y++)cropped.set(resized.subarray(((y+top)*w+left)*3,((y+top)*w+left+roi[2])*3),y*roi[2]*3);
 return {resized,cropped,unpaddedROI:roi,originalCropRect:[...originalCropRect]};
}
module.exports={resizeResidual,resizeFloat3:(source,sw,sh,w,h)=>native.resize(source,sw,sh,w,h,3)};