'use strict';
const {warpByte}=require('./lib/byte-warp.cjs'),post=require('./postblend.cjs'),{cvtss2siNearestEven}=require('./lib/blend.cjs');
const f=Math.fround;
function prepareAligned({source,width,height,geometry}){
 const [x,y,w,h]=geometry.ROI,[mw,mh]=geometry.modelWH;
 if(!(source instanceof Uint8Array)||source.length!==width*height*3||!Array.from(geometry.ROI).every(Number.isInteger)||x<0||y<0||w<1||h<1||w>4096||h>4096||x+w>width||y+h>height||mw!==512||![384,512].includes(mh))throw Error('唇纹人脸区域或照片尺寸无效');
 const roi=new Uint8Array(w*h*3);for(let r=0;r<h;r++)roi.set(source.subarray(((y+r)*width+x)*3,((y+r)*width+x+w)*3),r*w*3);
 const aligned=warpByte(roi,w,h,geometry.final,mw,mh,3),n=mw*mh,tensor=new Float32Array(3*n),scale=f(1/127.5);
 for(let i=0;i<n;i++)for(let c=0;c<3;c++)tensor[c*n+i]=f(f(aligned[i*3+c]-f(127.5))*scale);
 return {roi,aligned,tensor,dimensions:[1,3,mh,mw]};
}
function modelBytes(raw,w,h){
 const n=w*h;if(!(raw instanceof Float32Array)||raw.length!==4*n||!raw.every(Number.isFinite))throw Error('唇纹输出四平面无效');
 const rgb=new Uint8Array(3*n),mask=new Uint8Array(n);
 for(let i=0;i<n;i++)for(let c=0;c<4;c++){const v=f(f(raw[c*n+i]+f(1))*f(127.5));if(!Number.isFinite(v)||Math.abs(v)>=2**30)throw Error('唇纹输出超出字节转换范围');const q=Math.max(0,Math.min(255,cvtss2siNearestEven(v)));if(c<3)rgb[i*3+c]=q;else mask[i]=q;}
 return {rgb,mask};
}
async function runFace({source,width,height,geometry,parsingPlanes,savedParsingInverse,savedParsingWH,strength},infer){
 // Own active-domain boundary: original <=DOUBLE.005 skips multiplication.
 if(!Number.isFinite(strength)||!(f(strength)>.005)||strength>1)throw Error('唇纹强度无效');
 const input=prepareAligned({source,width,height,geometry}),[mw,mh]=geometry.modelWH,raw=await infer({data:input.tensor,dimensions:input.dimensions}),model=modelBytes(raw,mw,mh);
 const prepared=post.prepare({planes21:parsingPlanes,v2WH:[384,384],savedInverse:savedParsingInverse,savedWH:savedParsingWH,sourceWH:[width,height],ROI:Array.from(geometry.ROI),forward:geometry.final,modelWH:geometry.modelWH,aligned:input.aligned,modelRGB:model.rgb,modelPlane3:model.mask});
 const rendered=post.render({prepared,sourceROI:input.roi,ROI:Array.from(geometry.ROI),modelWH:geometry.modelWH,strength}),[x,y,w,h]=geometry.ROI,output=source.slice();
 for(let r=0;r<h;r++)output.set(rendered.result.subarray(r*w*3,(r+1)*w*3),((y+r)*width+x)*3);
 let changedRGBFields=0;for(let i=0;i<rendered.result.length;i++)if(rendered.result[i]!==input.roi[i])changedRGBFields++;
 return {output,processed:true,crop:prepared.cropped.rect,changedRGBFields};
}
module.exports={runFace,prepareAligned,modelBytes};
