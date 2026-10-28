'use strict';
const f=Math.fround;
function inverseAffineF32(matrix){
 const [a,b,c,d,e,g]=Array.from(matrix,f);
 const det=f(f(a*e)-f(b*d)); const q=f(det===0?0:1/det);
 const A=f(e*q),B=f(-b*q),D=f(-d*q),E=f(a*q);
 return new Float32Array([A,B,f((-A)*c-B*g),D,E,f((-D)*c-E*g)]);
}
function transform2F32(points,matrix){
 const m=Array.from(matrix,f),out=new Float32Array(points.length);
 for(let i=0;i<points.length;i+=2){
  const x=f(points[i]),y=f(points[i+1]);
  out[i]=f(f(f(m[0]*x)+f(m[1]*y))+m[2]);
  out[i+1]=f(f(f(m[3]*x)+f(m[4]*y))+m[5]);
 }return out;
}
function bboxF32(points){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(let i=0;i<points.length;i+=2){const x=f(points[i]),y=f(points[i+1]);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 const x=Math.floor(x0),y=Math.floor(y0);
 return [x,y,Math.floor(x1)-x+1,Math.floor(y1)-y+1];
}
function roundEven(x){let v=Math.floor(x),r=x-v;return r<.5?v:r>.5?v+1:v%2===0?v:v+1;}
function clipResultROI(bbox,localWH){
 const x=f(Math.max(f(bbox[0]),0)),y=f(Math.max(f(bbox[1]),0));
 const w=f(Math.min(f(f(localWH[0])-x),f(bbox[2]))),h=f(Math.min(f(f(localWH[1])-y),f(bbox[3])));
 return [x,y,w,h].map(roundEven);
}
module.exports={inverseAffineF32,transform2F32,bboxF32,clipResultROI};
