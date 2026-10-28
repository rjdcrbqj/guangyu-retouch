'use strict';

// 148400e30：前后字节绝对差→原通道顺序灰度→阈值2蒙版及灰度>1的强度图。
// 1431f74a0/1431fd3b0的BYTE分支采用15位整数系数；忽略第4通道，不在这里交换颜色通道。
// 输入保持原BGR/BGRA字节顺序；尚不表示整项功能或上游颜色来源已与原版等价。
function analyzePreparedHairChanges({before,after,width,height,channels=3,beforeStride=width*channels,afterStride=width*channels,rect=[0,0,width,height]}){
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||![3,4].includes(channels))throw new RangeError('头发差异图尺寸或通道无效');
 for(const [data,stride] of [[before,beforeStride],[after,afterStride]]){
  const length=(height-1)*stride+width*channels;
  if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width*channels||!Number.isSafeInteger(length)||data.length<length)throw new RangeError('头发差异图长度或行距不足');
 }
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[2]<1||rect[3]<1||rect[0]+rect[2]>width||rect[1]+rect[3]>height)throw new RangeError('头发差异区域无效');
 const [x,y,w,h]=rect,gray=new Uint8Array(w*h),mask=new Uint8Array(w*h),intensity=new Uint8Array(w*h);
 for(let row=0;row<h;row++)for(let column=0;column<w;column++){
  const a=(row+y)*beforeStride+(column+x)*channels,b=(row+y)*afterStride+(column+x)*channels,index=row*w+column;
  const value=(Math.abs(before[a]-after[b])*3735+Math.abs(before[a+1]-after[b+1])*19235+Math.abs(before[a+2]-after[b+2])*9798+16384)>>>15;
  gray[index]=value;mask[index]=value>2?255:0;intensity[index]=value>1?value:0;
 }
 return {gray,mask,intensity,width:w,height:h};
}

module.exports={analyzePreparedHairChanges};
