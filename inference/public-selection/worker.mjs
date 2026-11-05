import {FilesetResolver,InteractiveSegmenter} from '../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
// SDK 1.2.0 defines POSITIVE=1 in vision.d.ts but does not export BrushMode at runtime.
let segmenter,imageKey=null;
window.initializePublicSelection=async()=>{
 const info=await (await fetch(new URL('./model.json',import.meta.url))).json(),bytes=await (await fetch(new URL('./interactive_segmentation.task',import.meta.url))).arrayBuffer();
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(digest!==info.sha256||bytes.byteLength!==info.bytes)throw new Error('公开点选模型校验失败');
 const files=await FilesetResolver.forVisionTasks(new URL('../node_modules/@mediapipe/tasks-vision/wasm',import.meta.url).href);
 segmenter=await InteractiveSegmenter.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(bytes),delegate:'CPU'}}).catch(error=>{console.error(error.stack||error);throw error;});imageKey=null;
 return {sha256:digest};
};
window.runPublicSelection=async request=>{
 const t0=performance.now(),{image,point,imageKey:key}=request||{};
 if(!segmenter||!point||![point.x,point.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!(/^[0-9a-f]{64}$/).test(key)||typeof image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image)||image.length>8*1024*1024)throw new Error('点选输入无效');
 if(imageKey!==key){
  imageKey=null;const bitmap=await createImageBitmap(await (await fetch(image)).blob());
  try{if(bitmap.width<1||bitmap.height<1||bitmap.width>1024||bitmap.height>1024)throw new Error('点选输入尺寸无效');segmenter.setImage(bitmap);imageKey=key;}finally{bitmap.close();}
 }
 // 每次是一个独立正点；加减在现有蒙版层执行，保持原有操作和历史语义。
 const t1=performance.now();const mask=segmenter.segment([{brushMode:1,point:[point],isCompleted:true}]);
 try{const t2=performance.now(),values=mask.getAsFloat32Array().slice();return {width:mask.width,height:mask.height,values,timing:{encode:t1-t0,decode:t2-t1,copy:performance.now()-t2}};}finally{mask.close();}
};
window.closePublicSelection=()=>{segmenter?.close();segmenter=null;imageKey=null;};
