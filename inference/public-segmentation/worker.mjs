import {FilesetResolver,ImageSegmenter} from '../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
let segmenter;
const category={hair:1,skin:3};

// 在使用实际下载字节前校验 SHA，模型和运行库都从本地加载。
window.initializePublicSegmentation=async()=>{
 const info=await (await fetch(new URL('./model.json',import.meta.url))).json();
 const bytes=await (await fetch(new URL('./selfie_multiclass_256x256.tflite',import.meta.url))).arrayBuffer();
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(digest!==info.sha256||bytes.byteLength!==info.bytes)throw new Error('公开人像分区模型校验失败');
 const files=await FilesetResolver.forVisionTasks(new URL('../node_modules/@mediapipe/tasks-vision/wasm',import.meta.url).href);
 segmenter=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(bytes),delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true});
 if(JSON.stringify(segmenter.getLabels())!==JSON.stringify(info.labels)){segmenter.close();segmenter=null;throw new Error('公开人像分区类别不匹配');}
 return {labels:info.labels,sha256:digest};
};

// 只接收程序生成的裁剪 PNG，返回已复制的概率数组，不修改输入照片。
window.runPublicSegmentation=async({image,kind})=>{
 if(!segmenter||!Object.hasOwn(category,kind)||typeof image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image)||image.length>4*1024*1024)throw new Error('人像分区输入无效');
 const bitmap=await createImageBitmap(await (await fetch(image)).blob());
 try{
  if(bitmap.width<1||bitmap.height<1||bitmap.width>512||bitmap.height>512)throw new Error('人像分区输入尺寸无效');
  const result=segmenter.segment(bitmap);
  try{
   if(result.confidenceMasks?.length!==6)throw new Error('人像分区输出类别无效');
   const mask=result.confidenceMasks[category[kind]];
   return {width:mask.width,height:mask.height,values:mask.getAsFloat32Array().slice()};
  }finally{result.close();}
 }finally{bitmap.close();}
};
window.closePublicSegmentation=()=>{segmenter?.close();segmenter=null;};
