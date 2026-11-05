'use strict';
const f=Math.fround;

// 按显式物理布局打包；采样与原解码器的颜色含义由上层另行确定。
function validateImage(image,side,mask,label){
 const channels=mask?1:3;
 if(!image||!(image.data instanceof Uint8Array)||image.width!==side||image.height!==side||
  !Number.isSafeInteger(image.stride)||image.stride<side*channels||image.stride*side>image.data.length||
  (!mask&&image.format!==300&&image.format!==301))throw TypeError(`${label}图像尺寸、通道或缓冲无效`);
 return channels;
}

// 保持逐步F32舍入与CHW布局，跳过源行中的padding。
function packImage(image,side,mask,label){
 const channels=validateImage(image,side,mask,label),area=side*side,out=new Float32Array(area*channels);
 const scale=f(mask?1/255:1/127.5),reverse=!mask&&image.format===300;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++)for(let c=0;c<channels;c++){
  const sourceChannel=reverse?2-c:c,value=image.data[y*image.stride+x*channels+sourceChannel];
  out[c*area+y*side+x]=f(f(mask?value:value-127.5)*scale);
 }
 return out;
}

// 原当前图仿射采样输出是FLOAT平面，保留小数，不能先转回BYTE。
function packPhoto(image){
 if(!(image?.data instanceof Float32Array))return packImage(image,768,false,'当前照片');
 if(image.width!==768||image.height!==768||image.layout!=='CHW'||image.format!==301||
  image.data.length!==3*768*768||!image.data.every(Number.isFinite))throw TypeError('当前FLOAT采样图布局无效');
 const out=new Float32Array(image.data.length),scale=f(1/127.5);
 for(let i=0;i<out.length;i++)out[i]=f(f(image.data[i]-127.5)*scale);
 return out;
}

// 四输入各自保留原定尺寸，参考图保持64，供模型的feature Resize使用。
function packInputs(inputs){
 if(!inputs)throw TypeError('参考图输入不完整');
 return {
  photo:packPhoto(inputs.photo),
  currentMask:packImage(inputs.currentMask,768,true,'当前蒙版'),
  reference:packImage(inputs.reference,64,false,'参考照片'),
  referenceMask:packImage(inputs.referenceMask,64,true,'参考蒙版')
 };
}
module.exports={packInputs};
