'use strict';
// Preprocessing and heatmap decoding adapted from OpenSeeFace tracker.py.
// Copyright (c) 2019, Emiliana. BSD-2-Clause; see LICENSE and NOTICE.
const {dimensions,portraitCrop}=require('../public-portrait-geometry.cjs');
const SIDE=224,GRID=28,PLANE=GRID*GRID;
function cropFace66(box,width,height){
 portraitCrop(box,width,height,'skin');
 const x=box.x*width,y=box.y*height,w=box.width*width,h=box.height*height;
 // Upstream clamp_to_im uses an exclusive Y endpoint (+1), including at the bottom edge.
 const left=Math.trunc(Math.max(0,x-Math.trunc(w*.1))),top=Math.trunc(Math.min(height-1,Math.max(0,y-Math.trunc(h*.125)))+1);
 const right=Math.trunc(Math.min(width-1,x+w+Math.trunc(w*.1))),bottom=Math.trunc(Math.min(height-1,y+h+Math.trunc(h*.125))+1);
 if(right-left<4||bottom-top<4)throw new Error('人脸框过小');
 return {left,top,width:right-left,height:bottom-top};
}
function prepareFace66(rgb,width,height){
 dimensions(width,height);if(!(rgb instanceof Uint8Array)||rgb.length!==width*height*3)throw new Error('照片颜色格式无效');
 const f=Math.fround,mean=[.485,.456,.406].map(f),std=[.229,.224,.225].map(f),scale=std.map(s=>f(1/f(s*255))),bias=mean.map((m,c)=>f(-m/std[c]));
 const input=new Float32Array(3*SIDE*SIDE);
 // OpenCV's float INTER_LINEAR uses pixel centres; don't quantize resampled RGB back to uint8.
 for(let y=0;y<SIDE;y++)for(let x=0;x<SIDE;x++){
  const sx=Math.max(0,Math.min(width-1,(x+.5)*width/SIDE-.5)),sy=Math.max(0,Math.min(height-1,(y+.5)*height/SIDE-.5));
  const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),dx=sx-x0,dy=sy-y0;
  for(let c=0;c<3;c++){
   const a=rgb[(y0*width+x0)*3+c],b=rgb[(y0*width+x1)*3+c],d=rgb[(y1*width+x0)*3+c],e=rgb[(y1*width+x1)*3+c];
   const value=(a*(1-dx)+b*dx)*(1-dy)+(d*(1-dx)+e*dx)*dy;
   input[c*SIDE*SIDE+y*SIDE+x]=f(f(value*scale[c])+bias[c]);
  }
 }
 return input;
}
function decodeFace66(tensor,crop,width,height){
 dimensions(width,height);
 if(!crop||!['left','top','width','height'].every(k=>Number.isInteger(crop[k]))||crop.left<0||crop.top<0||crop.width<4||crop.height<4||crop.left+crop.width>width||crop.top+crop.height>height)throw new Error('面部定位裁剪范围无效');
 const data=tensor?.data;
 // These are regressed heatmaps, not probabilities: real peaks and offsets can exceed 1.
 if(!Array.isArray(tensor?.dims)||tensor.dims.join(',')!=='1,198,28,28'||!(data instanceof Float32Array)||data.length!==198*PLANE||!data.every(Number.isFinite))throw new Error('公开 66 点模型输出无效');
 const logit=value=>{const p=Math.max(1e-7,Math.min(.9999999,value));return Math.log(p/(1-p))/16;},points=[];
 for(let i=0;i<66;i++){
  let peak=0;for(let j=1;j<PLANE;j++)if(data[i*PLANE+j]>data[i*PLANE+peak])peak=j;
  // Upstream calls the row offset x and the column offset y; restore image x/y explicitly.
  const row=223*Math.floor(peak/GRID)/27+223*logit(data[(i+66)*PLANE+peak]);
  const col=223*(peak%GRID)/27+223*logit(data[(i+132)*PLANE+peak]);
  points.push({x:(crop.left+crop.width/SIDE*col)/width,y:(crop.top+crop.height/SIDE*row)/height,score:data[i*PLANE+peak]});
 }
 return {type:'openseeface-66',points,width,height,confidence:points.reduce((sum,p)=>sum+p.score,0)/66};
}
async function reliableFace66(face,box){
 const p=face?.points;
 if(face?.type!=='openseeface-66'||!Array.isArray(p)||p.length!==66||!p.every(q=>q&&Number.isFinite(q.x)&&Number.isFinite(q.y)&&Math.abs(q.x)<=4&&Math.abs(q.y)<=4&&Number.isFinite(q.score)&&q.score>=0))return false;
 if(p.reduce((s,q)=>s+q.score,0)/66<.7||p.slice(48).some(q=>q.score<.5)||!box?.keypoints)return false;
 const {matchesAnchorTriplet,boxOverlap}=await import('../public-landmarks/geometry.mjs');
 const average=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),left=Math.min(...p.map(q=>q.x)),top=Math.min(...p.map(q=>q.y));
 const bounds={x:left,y:top,width:Math.max(...p.map(q=>q.x))-left,height:Math.max(...p.map(q=>q.y))-top};
 return boxOverlap(bounds,box)>.1&&matchesAnchorTriplet([average(average(p[36],p[39]),average(p[42],p[45])),p[30],average(p[58],p[62])],box);
}
module.exports={cropFace66,prepareFace66,decodeFace66,reliableFace66};
