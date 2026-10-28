'use strict';
const f=Math.fround;
function nearestEven(v){const n=Math.floor(v),d=v-n;return n+(d>.5||(d===.5&&(n&1))?1:0);}
function axis(source,side,horizontal){
 const inv=1/(side/source),out=[];
 for(let i=0;i<side;i++){
  const pos=f((i+.5)*inv-.5);let index=Math.floor(pos),fraction=f(pos-f(index));
  if(horizontal&&(index<0||index>=source-1)){index=Math.max(0,Math.min(source-1,index));fraction=0;}
  out.push([index,nearestEven(f(f(1-fraction)*2048)),nearestEven(f(fraction*2048))]);
 }
 return out;
}
// base的photo与mask分别传入；side由photo最短边/1500约束确定。
function resizeSuppliedReferenceBaseSquare({data,width,height,stride,channels,side,rounding}={}){
 if(![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||width*height>80000000||!Number.isInteger(side)||side<2||side>1500)
  throw RangeError('base方形缩放尺寸无效');
 const last=(height-1)*stride+width*channels;
 if(!(data instanceof Uint8Array)||![1,3].includes(channels)||!Number.isSafeInteger(stride)||stride<width*channels||!Number.isSafeInteger(last)||data.length<last||rounding!=='nearest-even')
  throw TypeError('base方形缩放布局/RN无效');
 const rowSize=side*channels,out=new Uint8Array(rowSize*side);
 if(width===side&&height===side){
  for(let y=0;y<side;y++)out.set(data.subarray(y*stride,y*stride+rowSize),y*rowSize);
 }else if(width===2*side&&height===2*side){
  for(let y=0;y<side;y++)for(let x=0;x<side;x++)for(let c=0;c<channels;c++){
   const p=y*2*stride+x*2*channels+c;
   out[y*rowSize+x*channels+c]=(data[p]+data[p+channels]+data[p+stride]+data[p+stride+channels]+2)>>2;
  }
 }else{
  const xp=axis(width,side,true),yp=axis(height,side,false);
  for(let y=0;y<side;y++){
   const [iy,b0,b1]=yp[y],y0=Math.max(0,Math.min(height-1,iy)),y1=Math.max(0,Math.min(height-1,iy+1));
   for(let x=0;x<side;x++){
    const [ix,a0,a1]=xp[x],x1=Math.min(width-1,ix+1);
    for(let c=0;c<channels;c++){
     const h0=data[y0*stride+ix*channels+c]*a0+data[y0*stride+x1*channels+c]*a1;
     const h1=data[y1*stride+ix*channels+c]*a0+data[y1*stride+x1*channels+c]*a1;
     out[y*rowSize+x*channels+c]=(((h0>>4)*b0>>16)+((h1>>4)*b1>>16)+2)>>2;
    }
   }
  }
 }
 return {data:out,width:side,height:side,stride:rowSize,channels};
}
module.exports={resizeSuppliedReferenceBaseSquare};
