'use strict';
const {resizeBytes}=require('../opencv-runtime.cjs');
const {blendPreparedHairInput}=require('./bridge.cjs');
const {packPreparedHairInput}=require('./input.cjs');

// 按1483f95d0裁切、去除透明通道并准备基础模型图；调用前初始化已有离线图像库。
// modelWH必须由上游提供：原模型尺寸取整入口仍未确认，此处不猜测它。
function prepareHairBaseImage({image,width,height,channels=3,stride=width*channels,rect,modelWH}){
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||![3,4].includes(channels)||!(image instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width*channels||image.length<(height-1)*stride+width*channels)throw new RangeError('头发来源图像尺寸、通道或行距无效');
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[2]<3||rect[3]<3||rect[0]+rect[2]>width||rect[1]+rect[3]>height)throw new RangeError('头发基础输入区域过小或越界');
 if(!Array.isArray(modelWH)||modelWH.length!==2||!modelWH.every(v=>Number.isSafeInteger(v)&&v>0&&v<=0x3fffffff))throw new RangeError('头发基础模型尺寸无效');
 const [x,y,rw,rh]=rect,[mw,mh]=modelWH;
 let pixels=new Uint8Array(rw*rh*3),currentWidth=rw,currentHeight=rh,intermediateWH=null;
 for(let row=0;row<rh;row++)for(let col=0;col<rw;col++){
  const source=(y+row)*stride+(x+col)*channels,target=(row*rw+col)*3;
  pixels[target]=image[source];pixels[target+1]=image[source+1];pixels[target+2]=image[source+2];
 }
 // 1483f9860/986d确为交叉比较，不能替换成惯常的同轴比较；普通常量148e247f8为double 1.5。
 if(rw>mh*2||rh>mw*2){
  intermediateWH=[Math.trunc(mw*1.5),Math.trunc(mh*1.5)];
  pixels=resizeBytes({data:pixels,width:rw,height:rh,channels:3,targetWidth:intermediateWH[0],targetHeight:intermediateWH[1]});
  [currentWidth,currentHeight]=intermediateWH;
 }
 if(currentWidth!==mw||currentHeight!==mh)pixels=resizeBytes({data:pixels,width:currentWidth,height:currentHeight,channels:3,targetWidth:mw,targetHeight:mh});
 return {pixels,width:mw,height:mh,channels:3,intermediateWH};
}

// 基础结果混入图像后，分别缩放图像与原柔边蒙版，再打包细节模型输入。
// detailSide由上游提供；不能擅自替代尚未确认的原0.8倍尺寸取整。
function prepareHairDetailInput({image,smooth,alpha,mask,width,height,detailSide,branch='scalar'}){
 if(![width,height,detailSide].every(v=>Number.isSafeInteger(v)&&v>0))throw new RangeError('头发细节输入尺寸无效');
 const count=width*height;
 if(!Number.isSafeInteger(count*3)||!(image instanceof Uint8Array)||image.length!==count*3||!(smooth instanceof Uint8Array)||smooth.length!==count*3||!(alpha instanceof Uint8Array)||alpha.length!==count||!(mask instanceof Uint8Array)||mask.length!==count)throw new RangeError('头发细节输入图层尺寸不匹配');
 let pixels=blendPreparedHairInput({image,smooth,alpha,width,height,channels:3,branch}),detailMask=mask;
 if(width!==detailSide||height!==detailSide){
  pixels=resizeBytes({data:pixels,width,height,channels:3,targetWidth:detailSide,targetHeight:detailSide});
  detailMask=resizeBytes({data:mask,width,height,channels:1,targetWidth:detailSide,targetHeight:detailSide});
 }
 return packPreparedHairInput({pixels,mask:detailMask,width:detailSide,height:detailSide});
}

module.exports={prepareHairBaseImage,prepareHairDetailInput};
