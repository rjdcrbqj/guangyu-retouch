'use strict';
const {triangleBlur}=require('../skin-unify/lib/highlight.cjs');

// 只适配原无resize分支；更大尺寸的两次resize仍待闭合。
function blurSmallSuppliedProtection({data,width,height,stride,requestedRadius=20}){
 if(![width,height].every(v=>Number.isInteger(v)&&v>=11&&v<=512))throw RangeError('参考图保护蒙版尺寸超出已接入范围');
 if(!Number.isInteger(requestedRadius)||requestedRadius<1||requestedRadius>64)throw RangeError('保护模糊需要明确支持域内的整数radius1..64');
 if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width||!Number.isSafeInteger(stride*height)||data.length<stride*height)throw TypeError('参考图保护蒙版缓冲无效');
 const packed=new Uint8Array(width*height);
 for(let y=0;y<height;y++)packed.set(data.subarray(y*stride,y*stride+width),y*width);
 const effectiveRadius=Math.min(requestedRadius,((Math.min(width,height)>>>1)-1)>>>1); // 20或30来自caller；原分派器按短边限幅。
 return {mask:triangleBlur({data:packed,width,height,radius:effectiveRadius}),effectiveRadius};
}
module.exports={blurSmallSuppliedProtection};
