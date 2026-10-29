'use strict';
const {resizeBytes,quantizeFloatAlphaBytes}=require('../opencv-runtime.cjs');
const {blendPreparedHairInput}=require('../hair-smooth/bridge.cjs');
const positive=values=>values.every(v=>Number.isSafeInteger(v)&&v>0);

// 对应147fe4270：零画布还原缓存→float alpha乘255转字节→缩放→可选位与保护。
// 目标人物区域和保护蒙版由上游提供；不推断原图坐标缩放或人物开关。
function composeCachedToothRepairRegion({image,width,height,channels=3,stride=width*channels,rect,cache,mask,branch='scalar'}){
 if(![3,4].includes(channels)||!['scalar','sse41'].includes(branch)||branch==='sse41'&&channels!==3||!positive([width,height,stride,width*height*channels])||stride<width*channels||!(image instanceof Uint8Array)||image.length<(height-1)*stride+width*channels)throw new RangeError('牙齿目标图像尺寸、通道、行距或分支无效');
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||!positive(rect.slice(2))||rect[0]+rect[2]>width||rect[1]+rect[3]>height)throw new RangeError('牙齿目标区域越界');
 if(!cache||!Array.isArray(cache.canvasWH)||cache.canvasWH.length!==2||!positive(cache.canvasWH)||!Array.isArray(cache.cropRect)||cache.cropRect.length!==4||!cache.cropRect.every(v=>Number.isSafeInteger(v)&&v>=0))throw new RangeError('牙齿缓存区域无效');
 const [cw,ch]=cache.canvasWH,[cx,cy,rw,rh]=cache.cropRect;
 if(!positive([rw,rh,cw*ch*3])||rw!==cache.width||rh!==cache.height||cx+rw>cw||cy+rh>ch||!(cache.image instanceof Uint8Array)||cache.image.length!==rw*rh*3||!(cache.alpha instanceof Float32Array)||cache.alpha.length!==rw*rh||!cache.alpha.every(Number.isFinite))throw new RangeError('牙齿缓存尺寸、长度或浮点值无效');
 let preparedMask;
 if(mask){const {data,width:mw,height:mh,stride:ms=mw}=mask;if(!positive([mw,mh,ms,mw*mh])||ms<mw||!(data instanceof Uint8Array)||data.length<(mh-1)*ms+mw)throw new RangeError('牙齿保护蒙版尺寸或行距无效');preparedMask=new Uint8Array(mw*mh);for(let y=0;y<mh;y++)preparedMask.set(data.subarray(y*ms,y*ms+mw),y*mw);}
 const rgb=new Uint8Array(cw*ch*3),af=new Float32Array(cw*ch);
 for(let row=0;row<rh;row++){rgb.set(cache.image.subarray(row*rw*3,(row+1)*rw*3),((row+cy)*cw+cx)*3);af.set(cache.alpha.subarray(row*rw,(row+1)*rw),(row+cy)*cw+cx);}
 const [x,y,tw,th]=rect,alpha=resizeBytes({data:quantizeFloatAlphaBytes({data:af,width:cw,height:ch}),width:cw,height:ch,channels:1,targetWidth:tw,targetHeight:th});
 if(mask){const gate=resizeBytes({data:preparedMask,width:mask.width,height:mask.height,channels:1,targetWidth:tw,targetHeight:th});for(let i=0;i<alpha.length;i++)alpha[i]&=gate[i];}
 const smooth=resizeBytes({data:rgb,width:cw,height:ch,channels:3,targetWidth:tw,targetHeight:th}),source=new Uint8Array(tw*th*channels),output=Uint8Array.from(image);
 for(let row=0;row<th;row++){const start=(y+row)*stride+x*channels;source.set(image.subarray(start,start+tw*channels),row*tw*channels);}
 // 原函数先clone连续ROI，再只调用一次1446b3ea0；向量尾部不按行重新开始。
 const mixed=blendPreparedHairInput({image:source,smooth,alpha,width:tw,height:th,channels,branch});
 for(let row=0;row<th;row++)output.set(mixed.subarray(row*tw*channels,(row+1)*tw*channels),(y+row)*stride+x*channels);
 return output;
}
module.exports={composeCachedToothRepairRegion};
