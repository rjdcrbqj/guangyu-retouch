import {FilesetResolver,FaceLandmarker} from '../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
import {searchLandmarks,unrotateLandmarks} from './geometry.mjs';
let landmarker,detectionThreshold=.5;
// 核对整个官方模型包，关闭不需要的表情系数与变换矩阵输出。
window.initializePublicLandmarks=async()=>{
 const info=await (await fetch(new URL('./model.json',import.meta.url))).json();
 const bytes=await (await fetch(new URL('./face_landmarker.task',import.meta.url))).arrayBuffer();
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(digest!==info.sha256||bytes.byteLength!==info.bytes)throw new Error('公开面部定位模型校验失败');
 const files=await FilesetResolver.forVisionTasks(new URL('../node_modules/@mediapipe/tasks-vision/wasm',import.meta.url).href);
 landmarker=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(bytes),delegate:'CPU'},runningMode:'IMAGE',numFaces:3,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
 return {sha256:digest};
};

// 对无结果的倾斜裁脸尝试旋转；所有坐标先反变换回未旋转裁剪图。
window.runPublicLandmarks=async({image,box})=>{
 if(!landmarker||typeof image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image)||image.length>4*1024*1024)throw new Error('面部定位输入无效');
 const bitmap=await createImageBitmap(await (await fetch(image)).blob());
 try{
  const w=bitmap.width,h=bitmap.height,side=Math.max(w,h);
  if(w<1||h<1||side>512)throw new Error('面部定位尺寸无效');
  return await searchLandmarks(async(rotation,threshold)=>{
   if(detectionThreshold!==threshold){await landmarker.setOptions({minFaceDetectionConfidence:threshold});detectionThreshold=threshold;}
   let input=bitmap;
   if(rotation){const canvas=new OffscreenCanvas(side,side),ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,side,side);ctx.translate(side/2,side/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(bitmap,-w/2,-h/2);input=canvas;}
   return landmarker.detect(input).faceLandmarks.map(face=>unrotateLandmarks(face,rotation,w,h));
  },box);
 }finally{bitmap.close();}
};
window.closePublicLandmarks=()=>{landmarker?.close();landmarker=null;};
