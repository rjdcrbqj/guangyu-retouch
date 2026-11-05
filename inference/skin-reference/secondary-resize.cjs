'use strict';
const f=Math.fround;
function nearestEven(v){const n=Math.floor(v),d=v-n;return n+(d>.5||(d===.5&&(n&1))?1:0);}
function axis(destination,horizontal){
 const inverse=1/(destination/512),plan=[];
 for(let i=0;i<destination;i++){
  const position=f((i+.5)*inverse-.5);let index=Math.floor(position),fraction=f(position-f(index));
  if(horizontal&&(index<0||index>=511)){index=Math.max(0,Math.min(511,index));fraction=0;}
  plan.push([index,nearestEven(f(f(1-fraction)*2048)),nearestEven(f(fraction*2048))]);
 }
 return plan;
}
// 从明确供应的512² BYTE1工作结果还原ROI，不重新构造原保护图。
function resizeSuppliedSecondaryMaskFrom512(r){
 if(!r||r.math!=='native-code1-scalar-secondary512'||r.rounding!=='nearest-even')throw TypeError('二次保护回缩需要明确code1 scalar/nearest-even');
 const {data,stride,destinationWH}=r;
 if(!(Array.isArray(destinationWH)||destinationWH instanceof Int32Array)||destinationWH.length!==2||!Array.from(destinationWH).every(v=>Number.isInteger(v)&&v>=1&&v<=4096))throw RangeError('二次保护回缩目标需WH1..4096');
 const [width,height]=destinationWH,last=511*stride+512;
 if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<512||!Number.isSafeInteger(last)||data.length<last)throw TypeError('二次保护回缩需要完整512² BYTE1供给');
 const source=new Uint8Array(512*512);
 for(let y=0;y<512;y++)source.set(data.subarray(y*stride,y*stride+512),y*512);
 const output=new Uint8Array(width*height);
 if(width===512&&height===512)output.set(source);
 else if(width===256&&height===256){
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const p=y*1024+x*2;output[y*256+x]=(source[p]+source[p+1]+source[p+512]+source[p+513]+2)>>2;
  }
 }else{
  const xp=axis(width,true),yp=axis(height,false);
  for(let y=0;y<height;y++){
   const [iy,b0,b1]=yp[y],row0=Math.max(0,Math.min(511,iy))*512,row1=Math.max(0,Math.min(511,iy+1))*512;
   for(let x=0;x<width;x++){
    const [ix,a0,a1]=xp[x],next=Math.min(511,ix+1);
    const h0=source[row0+ix]*a0+source[row0+next]*a1,h1=source[row1+ix]*a0+source[row1+next]*a1;
    output[y*width+x]=(((h0>>4)*b0>>16)+((h1>>4)*b1>>16)+2)>>2;
   }
  }
 }
 return {data:output,width,height,stride:width};
}
module.exports={resizeSuppliedSecondaryMaskFrom512};
