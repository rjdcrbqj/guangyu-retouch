'use strict';const f=Math.fround;
function samplingInverse(forward){
 if(!(forward instanceof Float32Array)||forward.length!==6||!forward.every(Number.isFinite))throw TypeError('supplied finite forward6F32');
 const[a,b,c,d,e,g]=forward,det=f(f(a*e)-f(d*b)),q=det===0?0:f(1/det),ia=f(e*q),ib=f(-b*q),ic=f(-d*q),id=f(a*q);
 return Float32Array.from([ia,ib,f(f(-ia*c)-f(ib*g)),ic,id,f(f(-ic*c)-f(g*id))]);
}
function sample({source012,width,height,inverse,side=768}){
 if(!(source012 instanceof Uint8Array)||source012.length!==width*height*3||![width,height,side].every(Number.isInteger)||width<2||height<2||side!==768)throw RangeError('explicit sourceBYTE301/fullWH and 768 side required');
 if(!(inverse instanceof Float32Array)||inverse.length!==6||!inverse.every(Number.isFinite))throw TypeError('supplied finite inverse6F32');
 const[a,b,c,d,e,g]=inverse,n=side*side,out=new Float32Array(3*n);let valid=0;
 for(let y=0;y<side;y++){
  let sx=y*b+c,sy=y*e+g;
  for(let x=0;x<side;x++,sx+=a,sy+=d){
   const ix=Math.floor(sx),iy=Math.floor(sy);if(ix<0||iy<0||ix>=width-1||iy>=height-1)continue;
   valid++;const dx=f(sx-ix),dy=f(sy-iy),nx=f(1-dx),ny=f(1-dy),weights=[f(nx*ny),f(dx*ny),f(nx*dy),f(dx*dy)],p=(iy*width+ix)*3,rows=[p,p+3,p+width*3,p+width*3+3],index=y*side+x;
   for(let ch=0;ch<3;ch++)out[ch*n+index]=f(f(f(f(source012[rows[0]+ch]*weights[0])+f(source012[rows[1]+ch]*weights[1]))+f(source012[rows[2]+ch]*weights[2]))+f(source012[rows[3]+ch]*weights[3]));
  }
 }
 return {sampled:out,validFootprintPixels:valid};
}
function normalize(sampled){if(!(sampled instanceof Float32Array)||sampled.length!==3*768*768||!sampled.every(Number.isFinite))throw TypeError('finite768 planar3FLOAT');const out=new Float32Array(sampled.length),scale=f(1/127.5);for(let i=0;i<out.length;i++)out[i]=f(f(sampled[i]-f(127.5))*scale);return out;}
function prepare(o){const inverse=samplingInverse(o.forward),s=sample({...o,inverse});return {...s,samplingInverse:inverse,input:normalize(s.sampled)};}
module.exports={samplingInverse,sample,normalize,prepare};
