'use strict';
// Global-coordinate crop of the proven original C1 BYTE warp numeric branch.
// No translated-affine approximation, fullsource buffer or modernCV dependency.
const f=Math.fround;
function roundEven(v){const n=Math.floor(v),r=v-n;return r<.5?n:r>.5?n+1:n%2===0?n:n+1;}
function inverse(m){const[a,b,c,d,e,g]=m,det=a*e-b*d,q=det===0?0:1/det,A=e*q,B=b*(-q),D=d*(-q),E=a*q;return[A,B,(-A)*c-B*g,D,E,(-D)*c-E*g];}
function guard(m,W,H){const v=inverse(m),lim=2147482623;if(!v.every(Number.isFinite))throw RangeError('Finite inverse');for(const[a,b,c]of[[v[0],v[1],v[2]],[v[3],v[4],v[5]]]){const d=a*(W-1)*1024;if(Math.abs(d)>lim)throw RangeError('S32 delta domain');for(const y of[0,H-1]){const p=(b*y+c)*1024;if(Math.abs(p)>lim||Math.abs(p+d)>lim)throw RangeError('S32 global coordinates');}}return v;}
function warpByteCrop(source,sw,sh,m,targetFullW,targetFullH,roi,cn=1){
 if(cn!==1)throw RangeError('This finite crop proof is C1 BYTE only');
 if(![sw,sh,targetFullW,targetFullH].every(n=>Number.isInteger(n)&&n>=2&&n<=32766)||sw*sh>80000000||targetFullW*targetFullH>80000000)throw RangeError('Explicit 2..32766 WH and <=80MP domain');
 if(!(source instanceof Uint8Array)||source.length!==sw*sh||!(m instanceof Float32Array)||m.length!==6||!m.every(Number.isFinite))throw TypeError('BYTE source and 6F32 matrix');
 if(!Array.isArray(roi)||roi.length!==4||!roi.every(Number.isInteger))throw RangeError('Target ROI XYWH');const[rx,ry,w,h]=roi;
 if(rx<0||ry<0||w<1||h<1||rx+w>targetFullW||ry+h>targetFullH)throw RangeError('Target ROI must be inside global target');
 const z=guard(m,targetFullW,targetFullH),dx=new Int32Array(w),dy=new Int32Array(w),out=new Uint8Array(w*h);
 for(let x=0;x<w;x++){const gx=rx+x;dx[x]=roundEven((z[0]*gx)*1024);dy[x]=roundEven((z[3]*gx)*1024);}
 const sample=(x,y)=>x<0||x>=sw||y<0||y>=sh?0:source[y*sw+x];
 for(let y=0;y<h;y++){
  const gy=ry+y,ox=(roundEven((z[1]*gy+z[2])*1024)+16)|0,oy=(roundEven((z[4]*gy+z[5])*1024)+16)|0;
  for(let x=0;x<w;x++){
   const X=(ox+dx[x])|0,Y=(oy+dy[x])|0,sx=Math.max(-32768,Math.min(32767,X>>10)),sy=Math.max(-32768,Math.min(32767,Y>>10)),fx=(X>>5)&31,fy=(Y>>5)&31;
   let a=(32-fx)*(32-fy)*32,b=fx*(32-fy)*32,c=(32-fx)*fy*32,d=fx*fy*32;if(a===32768){a=32767;d=1;}
   const sum=sample(sx,sy)*a+sample(sx+1,sy)*b+sample(sx,sy+1)*c+sample(sx+1,sy+1)*d;out[y*w+x]=Math.max(0,Math.min(255,(sum+16384)>>15));
  }
 }
 return out;
}
module.exports={warpByteCrop};
