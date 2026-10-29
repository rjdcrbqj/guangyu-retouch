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
// 牙齿修复的float32作用范围先乘255并量化，再按目标区域缩放。
function quantizeFloatAlphaBytes({data,width,height}){
 const n=dimensions(width,height);if(!(data instanceof Float32Array)||data.length!==n||!data.every(Number.isFinite))throw new RangeError('浮点作用范围尺寸或数值无效');
 const cv=runtime(),src=cv.matFromArray(height,width,cv.CV_32FC1,data),dst=new cv.Mat();
 try{src.convertTo(dst,cv.CV_8U,255,0);return new Uint8Array(dst.data);}finally{dst.delete();src.delete();}
}
function fillPolygonFloat32({width,height,points}){
 const n=dimensions(width,height);if(!Array.isArray(points)||points.length<3||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647)))throw new RangeError('浮点图层多边形无效');
 const cv=runtime(),src=cv.matFromArray(height,width,cv.CV_32FC1,new Float32Array(n)),contour=cv.matFromArray(points.length,1,cv.CV_32SC2,points.flat()),list=new cv.MatVector();
 try{list.push_back(contour);cv.fillPoly(src,list,new cv.Scalar(1),8,0,new cv.Point(0,0));return new Float32Array(src.data32F);}finally{list.delete();contour.delete();src.delete();}
}
// 147fe4130→1478dec70的清晰度统计：归一化正变换、四角30×30清零、实数逆变换。
function toothFrequencyDetailScore({data,width,height,channels}){
 bytes(data,width,height,channels);const cv=runtime(),src=cv.matFromArray(height,width,type(cv,channels),data),mats=Array.from({length:8},()=>new cv.Mat()),[gray,small,blurred,float,spectrum,spatial,magnitude,logs]=mats;
 try{
  if(channels===1)src.copyTo(gray);else cv.cvtColor(src,gray,channels===3?cv.COLOR_RGB2GRAY:cv.COLOR_RGBA2GRAY,0);
  cv.resize(gray,small,new cv.Size(256,256),0,0,cv.INTER_LINEAR);cv.blur(small,blurred,new cv.Size(3,3),new cv.Point(-1,-1),cv.BORDER_REFLECT_101);blurred.convertTo(float,cv.CV_32F,1,0);
  cv.dft(float,spectrum,cv.DFT_SCALE|cv.DFT_COMPLEX_OUTPUT,0);
  const bins=spectrum.data32F;for(const top of [0,226])for(const left of [0,226])for(let y=top;y<top+30;y++)for(let x=left;x<left+30;x++){const i=(y*256+x)*2;bins[i]=0;bins[i+1]=0;}
  cv.dft(spectrum,spatial,cv.DFT_INVERSE|cv.DFT_REAL_OUTPUT,0);float.data32F.fill(0);cv.absdiff(spatial,float,magnitude);
  if(cv.minMaxLoc(magnitude).maxVal<=0)return -1;
  cv.log(magnitude,logs);logs.convertTo(logs,-1,20,0);return Math.fround(cv.mean(logs)[0]);
 }finally{for(const m of mats.reverse())m.delete();src.delete();}
}
// 147fe6530/144e5e2d0：原强度图的凸包与经过缩小、形态学和简化的轮廓分开保存。
function toothChangeContours({data,width,height}){
 bytes(data,width,height,1);const cv=runtime(),owned=[],own=value=>(owned.push(value),value),F=Math.fround;
 const find=src=>{const vector=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(src,vector,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);const result=[];for(let i=0;i<vector.size();i++){const c=vector.get(i);try{result.push(Array.from(c.data32S));}finally{c.delete();}}return result;};
 const nearestEven=v=>{const n=Math.floor(v),r=v-n;return r<.5?n:r>.5?n+1:n+(n&1);};
 const area=points=>{let sum=0,j=points.length-2;for(let i=0;i<points.length;i+=2){sum+=F(points[j])*F(points[i+1])-F(points[j+1])*F(points[i]);j=i;}return Math.abs(sum*.5);};
 try{
  const src=own(cv.matFromArray(height,width,cv.CV_8UC1,data)),raw=find(src),all=raw.flat();let hull=[];const contours=[];
  if(all.length){const points=own(cv.matFromArray(all.length/2,1,cv.CV_32SC2,all)),result=own(new cv.Mat());cv.convexHull(points,result,false,true);hull=Array.from(result.data32S);}
  if(width>=9&&height>=9){
   const small=own(new cv.Mat());let scale=1;
   if(width<=128&&height<=128)src.copyTo(small);else{scale=F(F(128)/F(Math.max(width,height)));cv.resize(src,small,new cv.Size(Math.max(1,nearestEven(F(F(width)*scale))),Math.max(1,nearestEven(F(F(height)*scale)))),0,0,cv.INTER_LINEAR);}
   cv.threshold(small,small,.5,255,cv.THRESH_BINARY);
   const grow=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(7,7))),shrink=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3)));
   cv.dilate(small,small,grow,new cv.Point(-1,-1),1,cv.BORDER_CONSTANT,new cv.Scalar(0));cv.erode(small,small,shrink,new cv.Point(-1,-1),1,cv.BORDER_CONSTANT,new cv.Scalar(255));
   const simplified=own(new cv.Mat());
   for(const points of find(small))if(points.length>=6){const c=cv.matFromArray(points.length/2,1,cv.CV_32SC2,points);try{cv.approxPolyDP(c,simplified,2,true);if(simplified.data32S.length>=6)contours.push(Array.from(simplified.data32S,v=>Math.trunc(F(F(v)/scale))));}finally{c.delete();}}
   // 原std::sort按绝对面积降序；面积相同轮廓的相对次序不作为复原契约。
   contours.sort((a,b)=>area(b)-area(a));
  }
  return {hull,contours};
 }finally{for(const value of owned.reverse())value.delete();}
}
// 原144e403d0/144e3fcb0/1425c48d0使用float32齐次LU逆矩阵、四角变换与boundingRect。
function modelSquareBounds({affine,side}){
 if(!(affine instanceof Float32Array)||affine.length!==6||!affine.every(Number.isFinite)||!Number.isInteger(side)||side<1)throw new RangeError('模型四角仿射无效');const cv=runtime(),m=cv.matFromArray(3,3,cv.CV_32F,[...affine,0,0,1]),inv=new cv.Mat(),corners=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,0,side,side,0,side,side]),result=new cv.Mat();let two;
 try{if(!cv.invert(m,inv,cv.DECOMP_LU))throw new RangeError('模型仿射不可逆');two=cv.matFromArray(2,3,cv.CV_32F,Array.from(inv.data32F).slice(0,6));cv.transform(corners,result,two);const b=cv.boundingRect(result);return {bounds:[b.x,b.y,b.width,b.height],corners:new Float32Array(result.data32F)};}finally{if(two)two.delete();result.delete();corners.delete();inv.delete();m.delete();}
}
module.exports={initializeOpenCV,drawPolygonByte,warpBytes,resizeBytes,resizeFloat32,expandAndBlurMaskBytes,gateFloatAlphaBytes,scaleMaskBytes,quantizeFloatAlphaBytes,fillPolygonFloat32,toothFrequencyDetailScore,toothChangeContours,modelSquareBounds};
