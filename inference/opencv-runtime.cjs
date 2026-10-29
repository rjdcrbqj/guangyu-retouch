'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const SHA256='bd0c3e6448043de04f6a64a12cb7b759f78c3ab8f7c35c9f2e0f71c88bb17103';
let ready,pending;
function initializeOpenCV(){
 if(ready)return Promise.resolve();
 if(!pending)pending=(async()=>{
  const file=path.join(__dirname,'assets/opencv/opencv.cjs'),bytes=await fs.readFile(file);
  if(createHash('sha256').update(bytes).digest('hex')!==SHA256)throw new Error('离线图像库校验失败');
  const cv=require(file);
  await new Promise((resolve,reject)=>{try{if(typeof cv.then==='function')cv.then(()=>{delete cv.then;ready=cv;resolve();});else if(cv.Mat){ready=cv;resolve();}else reject(new Error('离线图像库初始化失败'));}catch(e){reject(e);}});
 })().catch(e=>{pending=undefined;throw e;});
 return pending;
}
function runtime(){if(!ready)throw new Error('请先初始化离线图像库');return ready;}
function dimensions(w,h){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1)throw new RangeError('图像尺寸无效');return w*h;}
function bytes(v,w,h,ch){const n=dimensions(w,h);if(![1,3,4].includes(ch)||!(v instanceof Uint8Array)||v.length!==n*ch)throw new RangeError('图像像素尺寸无效');}
function type(cv,ch){return ch===1?cv.CV_8UC1:ch===3?cv.CV_8UC3:cv.CV_8UC4;}
function drawPolygonByte({data,width,height,points,color,lineType}){
 bytes(data,width,height,1);if(![0,255].includes(color)||![8,16].includes(lineType)||!Array.isArray(points)||points.length<3||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isInteger)))throw new RangeError('原保护多边形参数无效');
 const cv=runtime(),im=cv.matFromArray(height,width,cv.CV_8UC1,data),contour=cv.matFromArray(points.length,1,cv.CV_32SC2,points.flat()),list=new cv.MatVector(),hierarchy=new cv.Mat();
 try{list.push_back(contour);cv.drawContours(im,list,-1,new cv.Scalar(color),-1,lineType,hierarchy,2147483647,new cv.Point(0,0));return new Uint8Array(im.data);}finally{hierarchy.delete();list.delete();contour.delete();im.delete();}
}
function warpBytes({data,width,height,channels,affine,targetWidth,targetHeight,borderValue}){
 bytes(data,width,height,channels);dimensions(targetWidth,targetHeight);
 if(!((affine instanceof Float32Array)||(affine instanceof Float64Array))||affine.length!==6||!affine.every(Number.isFinite)||!Number.isInteger(borderValue)||borderValue<0||borderValue>255)throw new RangeError('原仿射参数无效');
 const cv=runtime(),src=cv.matFromArray(height,width,type(cv,channels),data),dst=new cv.Mat(),m=cv.matFromArray(2,3,affine instanceof Float32Array?cv.CV_32F:cv.CV_64F,affine);
 try{cv.warpAffine(src,dst,m,new cv.Size(targetWidth,targetHeight),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(borderValue,borderValue,borderValue,borderValue));return new Uint8Array(dst.data);}finally{m.delete();dst.delete();src.delete();}
}
function resizeBytes({data,width,height,channels,targetWidth,targetHeight}){
 bytes(data,width,height,channels);dimensions(targetWidth,targetHeight);const cv=runtime(),src=cv.matFromArray(height,width,type(cv,channels),data),dst=new cv.Mat();
 try{cv.resize(src,dst,new cv.Size(targetWidth,targetHeight),0,0,cv.INTER_LINEAR);return new Uint8Array(dst.data);}finally{dst.delete();src.delete();}
}
function resizeFloat32({data,width,height,channels,targetWidth,targetHeight}){
 const n=dimensions(width,height);dimensions(targetWidth,targetHeight);if(!(data instanceof Float32Array)||data.length!==n*channels||![1,3].includes(channels)||!data.every(Number.isFinite))throw new RangeError('原float图像无效');
 const cv=runtime(),src=cv.matFromArray(height,width,channels===1?cv.CV_32FC1:cv.CV_32FC3,data),dst=new cv.Mat();
 try{cv.resize(src,dst,new cv.Size(targetWidth,targetHeight),0,0,cv.INTER_LINEAR);return new Float32Array(dst.data32F);}finally{dst.delete();src.delete();}
}
// 字节蒙版：椭圆核膨胀后做归一化方框模糊；对应原142612db0/141fa41b0。
function expandAndBlurMaskBytes({data,width,height,expandSize,blurSize}){
 bytes(data,width,height,1);dimensions(expandSize,blurSize);
 const cv=runtime(),src=cv.matFromArray(height,width,cv.CV_8UC1,data),expanded=new cv.Mat(),dst=new cv.Mat(),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(expandSize,expandSize));
 try{cv.dilate(src,expanded,kernel,new cv.Point(-1,-1),1,cv.BORDER_CONSTANT,new cv.Scalar(0));cv.blur(expanded,dst,new cv.Size(blurSize,blurSize),new cv.Point(-1,-1),cv.BORDER_REFLECT);return new Uint8Array(dst.data);}finally{kernel.delete();dst.delete();expanded.delete();src.delete();}
}
// 先在float32中相乘，再量化；提前将模型透明度转成字节会改变边缘像素。
function gateFloatAlphaBytes({alpha,mask,width,height}){
 bytes(mask,width,height,1);if(!(alpha instanceof Float32Array)||alpha.length!==width*height||!alpha.every(Number.isFinite))throw new RangeError('浮点作用范围无效');
 const cv=runtime(),src=cv.matFromArray(height,width,cv.CV_32FC1,alpha),maskByte=cv.matFromArray(height,width,cv.CV_8UC1,mask),maskFloat=new cv.Mat(),product=new cv.Mat(),dst=new cv.Mat();
 try{maskByte.convertTo(maskFloat,cv.CV_32F,1/255,0);cv.multiply(src,maskFloat,product,1,-1);product.convertTo(dst,cv.CV_8U,1,0);return new Uint8Array(dst.data);}finally{dst.delete();product.delete();maskFloat.delete();maskByte.delete();src.delete();}
}
// 原去白发合成先将强度乘到8位蒙版上；保留convertTo的取整，再进入像素混合。
function scaleMaskBytes({data,width,height,strength}){
 bytes(data,width,height,1);if(!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('蒙版强度无效');
 const cv=runtime(),src=cv.matFromArray(height,width,cv.CV_8UC1,data),dst=new cv.Mat();
 try{src.convertTo(dst,cv.CV_8U,Math.fround(strength),0);return new Uint8Array(dst.data);}finally{dst.delete();src.delete();}
}
// 原144e403d0/144e3fcb0/1425c48d0使用float32齐次LU逆矩阵、四角变换与boundingRect。
function modelSquareBounds({affine,side}){
 if(!(affine instanceof Float32Array)||affine.length!==6||!affine.every(Number.isFinite)||!Number.isInteger(side)||side<1)throw new RangeError('模型四角仿射无效');const cv=runtime(),m=cv.matFromArray(3,3,cv.CV_32F,[...affine,0,0,1]),inv=new cv.Mat(),corners=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,0,side,side,0,side,side]),result=new cv.Mat();let two;
 try{if(!cv.invert(m,inv,cv.DECOMP_LU))throw new RangeError('模型仿射不可逆');two=cv.matFromArray(2,3,cv.CV_32F,Array.from(inv.data32F).slice(0,6));cv.transform(corners,result,two);const b=cv.boundingRect(result);return {bounds:[b.x,b.y,b.width,b.height],corners:new Float32Array(result.data32F)};}finally{if(two)two.delete();result.delete();corners.delete();inv.delete();m.delete();}
}
module.exports={initializeOpenCV,drawPolygonByte,warpBytes,resizeBytes,resizeFloat32,expandAndBlurMaskBytes,gateFloatAlphaBytes,scaleMaskBytes,modelSquareBounds};
