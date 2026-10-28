'use strict';
const {samplingInverse,sample}=require('../skin-unify/input.cjs');

// 参考图分支复用同一个768数值采样叶，几何始终使用其working inputForward。
function samplePreparedReferencePhoto({photo,geometry}={}){
 if(!photo||!(photo.data instanceof Uint8Array)||photo.format!==301||
  ![photo.width,photo.height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||photo.width*photo.height>80000000||
  !Number.isSafeInteger(photo.stride)||photo.stride<photo.width*3||!Number.isSafeInteger(photo.stride*photo.height)||photo.data.length<photo.stride*photo.height||
  geometry?.valid!==true||!(geometry.inputForward instanceof Float32Array)||geometry.inputForward.length!==6||!geometry.inputForward.every(Number.isFinite))throw TypeError('参考当前照片缺少明确301工作图或有效forward几何');
 const {width,height,stride}=photo,source012=new Uint8Array(width*height*3);
 for(let y=0;y<height;y++)source012.set(photo.data.subarray(y*stride,y*stride+width*3),y*width*3); // 原叶只接packed物理012，去除显式源padding。
 const inverse=samplingInverse(geometry.inputForward),out=sample({source012,width,height,inverse});
 return {data:out.sampled,width:768,height:768,layout:'CHW',format:301,samplingInverse:inverse,validFootprintPixels:out.validFootprintPixels};
}
module.exports={samplePreparedReferencePhoto};
