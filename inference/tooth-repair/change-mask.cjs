'use strict';
// 147fe4270：absdiff→inRange(0, Scalar(1.5,0,0,0))→NOT作为改动蒙版。
// BYTE标量上界按默认取偶变为[2,0,0,0]；独立的强度图是code6灰度值>1。
// 通道顺序原样保留；第4通道参与改动蒙版，但不参与灰度强度。
function analyzePreparedToothChanges({before,after,width,height,channels=3,beforeStride=width*channels,afterStride=width*channels,rect=[0,0,width,height]}){
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||![3,4].includes(channels))throw new RangeError('牙齿差异图尺寸或通道无效');
 for(const [data,stride] of [[before,beforeStride],[after,afterStride]]){const length=(height-1)*stride+width*channels;if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width*channels||!Number.isSafeInteger(length)||data.length<length)throw new RangeError('牙齿差异图长度或行距不足');}
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[2]<1||rect[3]<1||rect[0]+rect[2]>width||rect[1]+rect[3]>height)throw new RangeError('牙齿差异区域无效');
 const [x,y,w,h]=rect,gray=new Uint8Array(w*h),mask=new Uint8Array(w*h),intensity=new Uint8Array(w*h);
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  const a=(row+y)*beforeStride+(col+x)*channels,b=(row+y)*afterStride+(col+x)*channels,i=row*w+col,d0=Math.abs(before[a]-after[b]),d1=Math.abs(before[a+1]-after[b+1]),d2=Math.abs(before[a+2]-after[b+2]);
  const value=(d0*3735+d1*19235+d2*9798+16384)>>>15;
  gray[i]=value;intensity[i]=value>1?value:0;mask[i]=d0>2||d1!==0||d2!==0||channels===4&&before[a+3]!==after[b+3]?255:0;
 }
 return {gray,mask,intensity,width:w,height:h};
}
// 原147fe6530将局部Int32轮廓先加区域原点，再转换为全图Float32坐标。
function describePreparedToothChanges({data,width,height,stride=width,origin=[0,0]}){
 if(![width,height,stride].every(v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647)||stride<width||!Number.isSafeInteger(width*height)||!(data instanceof Uint8Array)||data.length<(height-1)*stride+width)throw new RangeError('牙齿轮廓强度图尺寸或行距无效');
 if(!Array.isArray(origin)||origin.length!==2||!origin.every((v,i)=>Number.isInteger(v)&&v>=-2147483648&&v+(i===0?width:height)-1<=2147483647))throw new RangeError('牙齿轮廓原点或范围无效');
 const packed=new Uint8Array(width*height);for(let y=0;y<height;y++)packed.set(data.subarray(y*stride,y*stride+width),y*width);
 const {toothChangeContours}=require('../opencv-runtime.cjs'),result=toothChangeContours({data:packed,width,height}),world=points=>Float32Array.from(points,(v,i)=>v+origin[i%2]);
 return {hull:world(result.hull),contours:result.contours.map(world)};
}
module.exports={analyzePreparedToothChanges,describePreparedToothChanges};
