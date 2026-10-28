'use strict';
// 原145bafbb0新鲜1024路径。原affine由调用方提供；不以独立ROI猜原运行时配准。
const {warpBytes,resizeBytes,drawPolygonByte}=require('./opencv-runtime.cjs');
const {normalizeMain}=require('./wrinkle-models.cjs');
const f=Math.fround,PROTECTION_INDICES=[62,63,64,57,69,70,71];
function validPoints(points){if(!Array.isArray(points)||points.length!==194||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw new RangeError('必须提供原194点');return points.map(p=>p.map(f));}
function crop(data,width,height,channels,roi){const [x,y,w,h]=roi;if(!(data instanceof Uint8Array)||data.length!==width*height*channels||!roi.every(Number.isInteger)||x<0||y<0||w<1||h<1||x+w>width||y+h>height)throw new RangeError('原ROI或图像尺寸无效');const out=new Uint8Array(w*h*channels);for(let row=0;row<h;row++)out.set(data.subarray(((y+row)*width+x)*channels,((y+row)*width+x+w)*channels),row*w*channels);return out;}
function transform194(points,affine,origin){return validPoints(points).map(([x,y])=>{x=f(x-origin[0]);y=f(y-origin[1]);return [f(f(f(y*affine[1])+affine[2])+f(x*affine[0])),f(f(affine[5]+f(y*affine[4]))+f(x*affine[3]))];});}
function prepare1024({data,width,height,points,roi,affine,perFaceMask,perFaceWidth,perFaceHeight,combinedMask,combinedWidth,combinedHeight,colorOrder}){
 validPoints(points);if(!Array.isArray(roi)||roi.length!==4||!(affine instanceof Float32Array)||affine.length!==6||!affine.every(Number.isFinite)||Math.abs(affine[0]*affine[4]-affine[1]*affine[3])<1e-12)throw new RangeError('必须提供有效原ROI和float32仿射');
 const [x,y,w,h]=roi,source=crop(data,width,height,3,roi),ratio=f(Math.max(width,height)/Math.max(combinedWidth,combinedHeight)),maskROI=roi.map(v=>Math.trunc(f(f(v)/ratio)));
 const face=resizeBytes({data:perFaceMask,width:perFaceWidth,height:perFaceHeight,channels:1,targetWidth:combinedWidth,targetHeight:combinedHeight});
 const a=crop(face,combinedWidth,combinedHeight,1,maskROI),b=crop(combinedMask,combinedWidth,combinedHeight,1,maskROI);for(let i=0;i<a.length;i++)a[i]&=b[i];
 const mask=resizeBytes({data:a,width:maskROI[2],height:maskROI[3],channels:1,targetWidth:w,targetHeight:h});
 const photo1536=warpBytes({data:source,width:w,height:h,channels:3,affine,targetWidth:1536,targetHeight:1536,borderValue:0}),mask1536=warpBytes({data:mask,width:w,height:h,channels:1,affine,targetWidth:1536,targetHeight:1536,borderValue:0});
 const aligned194=transform194(points,affine,[x,y]),protectionPolygon=PROTECTION_INDICES.map(i=>aligned194[i].map(Math.trunc));
 const protected1536=drawPolygonByte({data:mask1536,width:1536,height:1536,points:protectionPolygon,color:0,lineType:16});
 const photo1024=resizeBytes({data:photo1536,width:1536,height:1536,channels:3,targetWidth:1024,targetHeight:1024}),mask1024=resizeBytes({data:protected1536,width:1536,height:1536,channels:1,targetWidth:1024,targetHeight:1024});
 const input=normalizeMain(photo1024,mask1024,1024,colorOrder),modelPoints194=aligned194.map(p=>p.map(v=>f(v/f(1.5))));
 return {input,photo1536,photo1024,mask1536,protected1536,mask1024,rawPoints194:validPoints(points),aligned194,modelPoints194,protectionPolygon,maskROI,affine:new Float32Array(affine),roi:[...roi],colorOrder,nativeScalar358:f(f(Math.min(width,height))/f(Math.max(w,h))),nativeApplicationParity:false};
}
module.exports={prepare1024,transform194,PROTECTION_INDICES};
