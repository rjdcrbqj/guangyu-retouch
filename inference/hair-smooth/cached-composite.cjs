'use strict';
const {alignPreparedHairPlane}=require('./region.cjs');
const {resizeBytes}=require('../opencv-runtime.cjs');
const {composePreparedHairRegion}=require('./composite.cjs');

// 按148400e30的缓存补边→线性缩放→合成顺序组合；调用前须初始化已有离线图像库。
// 仅消费已供应的缓存和整数目标Rect；不推断分割、模型尺寸取整或整体原版一致性。
function composeCachedHairRegion({image,channels,imageStride,rect,layers,smoothStrength=1,detailStrength=1,rounding='nearest-away'}){
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[2]===0||rect[3]===0)throw new RangeError('头发缓存目标区域无效');
 const [x,y,width,height]=rect;
 if(![3,4].includes(channels)||!(image instanceof Uint8Array)||!Number.isSafeInteger(imageStride)||imageStride<(x+width)*channels||image.length<(y+height-1)*imageStride+(x+width)*channels)throw new RangeError('头发目标图层长度、通道或行距不足');
 const prepared={};
 for(const [name,count] of [['smooth',3],['alpha',1],['detail',1],['mask',1]]){
  const layer=layers?.[name];
  if(!layer)throw new RangeError('缺少头发缓存图层 '+name);
  const aligned=alignPreparedHairPlane({...layer,channels:count});
  const rowBytes=aligned.width*count;
  if(!aligned.width||!aligned.height)throw new RangeError(name+' 缓存图层为空');
  let data=aligned.data;
  if(aligned.stride!==rowBytes||data.length!==rowBytes*aligned.height){
   data=new Uint8Array(rowBytes*aligned.height);
   for(let row=0;row<aligned.height;row++)data.set(aligned.data.subarray(row*aligned.stride,row*aligned.stride+rowBytes),row*rowBytes);
  }
  prepared[name]=aligned.width===width&&aligned.height===height?data:resizeBytes({data,width:aligned.width,height:aligned.height,channels:count,targetWidth:width,targetHeight:height});
 }
 return composePreparedHairRegion({image,...prepared,x,y,width,height,channels,imageStride,
  maskStride:width,alphaStride:width,smoothStride:width*3,detailStride:width,
  smoothStrength,detailStrength,rounding});
}

module.exports={composeCachedHairRegion};
