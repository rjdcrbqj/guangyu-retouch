'use strict';
const sharp=require('sharp'),{openPublicPhoto}=require('../public-photo.cjs');
const {PublicSegmentationRuntime}=require('./runtime.cjs');
const {PublicFaceLandmarks}=require('../public-landmarks/service.cjs');
const {protectFacialFeatures}=require('../public-landmarks/protection.cjs');

const {dimensions,portraitCrop}=require('../public-portrait-geometry.cjs');

// 按像素中心逆映射软蒙版，裁剪区域以外始终透明。
function projectConfidence(result,crop,sourceWidth,sourceHeight,width,height,maxInputEdge=512){
 dimensions(sourceWidth,sourceHeight);dimensions(width,height,1600*1600);
 const {values,width:mw,height:mh}=result||{};
 if(!(values instanceof Float32Array)||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<1||mh<1||![512,1024].includes(maxInputEdge)||mw>maxInputEdge||mh>maxInputEdge||values.length!==mw*mh||!values.every(v=>Number.isFinite(v)&&v>=-1e-6&&v<=1+1e-6))throw new Error('公开人像分区输出无效');
 if(!crop||!['left','top','width','height'].every(k=>Number.isInteger(crop[k]))||crop.left<0||crop.top<0||crop.width<1||crop.height<1||crop.left+crop.width>sourceWidth||crop.top+crop.height>sourceHeight)throw new Error('人像分区裁剪范围无效');
 const alpha=Buffer.alloc(width*height);
 for(let y=0;y<height;y++){
  const py=(y+.5)*sourceHeight/height-crop.top;if(py<0||py>=crop.height)continue;
  const sy=Math.max(0,Math.min(mh-1,py*mh/crop.height-.5)),iy=Math.floor(sy),jy=Math.min(mh-1,iy+1),dy=sy-iy;
  for(let x=0;x<width;x++){
   const px=(x+.5)*sourceWidth/width-crop.left;if(px<0||px>=crop.width)continue;
   const sx=Math.max(0,Math.min(mw-1,px*mw/crop.width-.5)),ix=Math.floor(sx),jx=Math.min(mw-1,ix+1),dx=sx-ix;
   const value=values[iy*mw+ix]*(1-dx)*(1-dy)+values[iy*mw+jx]*dx*(1-dy)+values[jy*mw+ix]*(1-dx)*dy+values[jy*mw+jx]*dx*dy;
   alpha[y*width+x]=Math.round(Math.max(0,Math.min(1,value))*255);
  }
 }
 return alpha;
}

class PublicPortraitSegmenter{
 constructor({runtime=new PublicSegmentationRuntime(),landmarks=null}={}){this.runtime=runtime;this.landmarks=landmarks;this.closed=false;this.running=false;this.active=null;this.closing=null;}
 async segment(bytes,box,width,height,kind='hair',{protectNostrils=false,includeGeometry=false}={}){
  if(this.closed)throw new Error('人像分区服务已关闭');
  if(this.running)throw new Error('正在识别人像分区，请稍候');
  dimensions(width,height,1600*1600);if(width>1600||height>1600)throw new Error('蒙版最长边不能超过 1600 像素');
  this.running=true;let finish;this.active=new Promise(resolve=>{finish=resolve;});const start=performance.now();
  try{
   const image=openPublicPhoto(bytes),meta=await image.metadata(),rotated=meta.orientation>=5&&meta.orientation<=8;
   const sourceWidth=rotated?meta.height:meta.width,sourceHeight=rotated?meta.width:meta.height;
   const crop=portraitCrop(box,sourceWidth,sourceHeight,kind);
   let geometry;if(kind==='skin'){
    this.landmarks??=new PublicFaceLandmarks();geometry=await this.landmarks.detect(bytes,box);
    if(geometry.width!==sourceWidth||geometry.height!==sourceHeight)throw new Error('面部定位尺寸不一致，原选区已保留');
   }
   const png=await image.rotate().extract(crop).flatten({background:'#000000'}).toColourspace('srgb').removeAlpha().resize({width:512,height:512,fit:'inside',kernel:'linear'}).png().toBuffer();
   const result=await this.runtime.run({image:'data:image/png;base64,'+png.toString('base64'),kind});
   let alpha=projectConfidence(result,crop,sourceWidth,sourceHeight,width,height);
   if(geometry)alpha=protectFacialFeatures(alpha,geometry,width,height,{protectNostrils});
   const rgba=Buffer.alloc(width*height*4,255);
   let foreground=0;for(let i=0;i<alpha.length;i++){rgba[i*4+3]=alpha[i];if(alpha[i]>127)foreground++;}
   const output=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
   return {...(includeGeometry&&geometry?{geometry}:{}),mask:output.toString('base64'),width,height,seconds:(performance.now()-start)/1000,foregroundFraction:foreground/alpha.length,model:geometry?'MediaPipe Multiclass + Face Landmarker · Apache-2.0':'MediaPipe Multiclass · Apache-2.0'};
  }finally{this.running=false;finish();}
 }
 async close(){
  this.closed=true;
  if(!this.closing)this.closing=(async()=>{await this.active;await Promise.all([this.runtime.close(),this.landmarks?.close()]);})();
  return this.closing;
 }
}
module.exports={PublicPortraitSegmenter,portraitCrop,projectConfidence};
