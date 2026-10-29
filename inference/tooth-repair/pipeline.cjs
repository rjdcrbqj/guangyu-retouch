'use strict';
const {resizeBytes}=require('../opencv-runtime.cjs');
const {prepareToothRepairAuxiliary}=require('./auxiliary.cjs');
const {packPreparedToothRepairInputs}=require('./input.cjs');
const {resizePreparedToothRepairOutput,decodePreparedToothRepairOutput}=require('./output.cjs');
const {composeCachedToothRepairRegion}=require('./composite.cjs');
const F=Math.fround,positive=values=>values.every(v=>Number.isSafeInteger(v)&&v>0);

// 147fdb400普通图像分支的已准备区域串联。人物有效性、整数ROI与保护蒙版由上游供应。
// 模型工作图固定512；关键点横纵坐标均按ROI宽度比例映射，不能分别用宽高比例。
// 暂未覆盖原人物选择、质量判定及另一套预览图分支；调用前初始化离线图像库。
async function processPreparedToothRepair({image,width,height,channels=3,stride=width*channels,rect,landmarks,mask,infer,branch='scalar'}){
 if(typeof infer!=='function')throw new TypeError('缺少牙齿模型供应器');
 if(![3,4].includes(channels)||!['scalar','sse41'].includes(branch)||branch==='sse41'&&channels!==3||!positive([width,height,stride,width*height*channels])||stride<width*channels||!(image instanceof Uint8Array)||image.length<(height-1)*stride+width*channels)throw new RangeError('牙齿源图、通道、行距或混合分支无效');
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[0]+rect[2]>width||rect[1]+rect[3]>height)throw new RangeError('牙齿区域无效或越界');
 const region=[...rect],[x,y,rw,rh]=region,source=Uint8Array.from(image);
 if(rw<10||rh<10)return source;
 if(!(landmarks instanceof Float32Array)||landmarks.length<214||landmarks.length%2!==0||!landmarks.every(Number.isFinite))throw new RangeError('牙齿关键点数量、类型或坐标无效');
 let protection;
 if(mask){const {data,width:mw,height:mh,stride:ms=mw}=mask;if(!positive([mw,mh,ms,mw*mh])||ms<mw||!(data instanceof Uint8Array)||data.length<(mh-1)*ms+mw)throw new RangeError('牙齿保护图层尺寸或行距无效');protection={data:Uint8Array.from(data),width:mw,height:mh,stride:ms};}
 const cropped=new Uint8Array(rw*rh*3);
 for(let row=0;row<rh;row++)for(let col=0;col<rw;col++)for(let c=0;c<3;c++)cropped[(row*rw+col)*3+c]=source[(row+y)*stride+(col+x)*channels+c];
 const pixels=resizeBytes({data:cropped,width:rw,height:rh,channels:3,targetWidth:512,targetHeight:512}),aligned=new Float32Array(landmarks.length),scale=F(512/F(rw));
 for(let i=0;i<landmarks.length;i+=2){aligned[i]=F(F(landmarks[i]-F(x))*scale);aligned[i+1]=F(F(landmarks[i+1]-F(y))*scale);}
 const auxiliary=prepareToothRepairAuxiliary({landmarks:aligned}),input=packPreparedToothRepairInputs({pixels,width:512,height:512,auxiliary}),prediction=await infer(input);
 if(!prediction)throw new RangeError('牙齿模型未返回图像与作用范围');
 const grid=resizePreparedToothRepairOutput({image:prediction.image,alpha:prediction.alpha,targetWH:[rw,rh]}),cache=decodePreparedToothRepairOutput(grid);
 return composeCachedToothRepairRegion({image:source,width,height,channels,stride,rect:region,cache,mask:protection,branch});
}
module.exports={processPreparedToothRepair};
