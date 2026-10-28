'use strict';
const {resizeBytes}=require('../opencv-runtime.cjs');
const {prepareHairMaskRegion}=require('./region.cjs');

// 读取单通道蒙版的有效行，排除行尾填充；输入仅来自已准备的人像分区。
function packedMask(layer,name){
 if(!layer)throw new RangeError(name+' 蒙版缺失');
 const {data,width,height,stride=width}=layer;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(width*height)||!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width||data.length<(height-1)*stride+width)throw new RangeError(name+' 蒙版尺寸或行距无效');
 if(stride===width&&data.length===width*height)return {data,width,height};
 const packed=new Uint8Array(width*height);
 for(let y=0;y<height;y++)packed.set(data.subarray(y*stride,y*stride+width),y*width);
 return {data:packed,width,height};
}

// 1483fc8f0先线性缩放人物蒙版，再调用141bb9ab0；其选定14319f610实现逐字节AND。
// 原人物分割来源尚未接入，调用前须初始化已有离线图像库（仅跨尺寸时需要）。
function preparePersonHairRegion({hair,person,hintRect}){
 const target=packedMask(hair,'头发'),source=packedMask(person,'人物'),{width,height}=target;
 const personData=source.width===width&&source.height===height?source.data:resizeBytes({...source,channels:1,targetWidth:width,targetHeight:height});
 const mask=new Uint8Array(width*height);
 for(let i=0;i<mask.length;i++)mask[i]=target.data[i]&personData[i];
 return {mask,width,height,...prepareHairMaskRegion({data:mask,width,height,hintRect})};
}

module.exports={preparePersonHairRegion};
