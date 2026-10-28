'use strict';
const f=Math.fround;
function nearestEven(v){const n=Math.floor(v),d=v-n;return n+(d>.5||(d===.5&&(n&1))?1:0);}
function plan(size,horizontal){
 // 原caller先算dst/src，再取倒数；保留DOUBLE步骤。
 const inverse=1/(64/size),out=[];
 for(let i=0;i<64;i++){
  const position=f((i+.5)*inverse-.5);
  let index=Math.floor(position),fraction=f(position-f(index));
  if(horizontal&&(index<0||index>=size-1)){index=Math.max(0,Math.min(size-1,index));fraction=0;}
  out.push([index,nearestEven(f(f(1-fraction)*2048)),nearestEven(f(fraction*2048))]);
 }
 return out;
}
// 只处理明确供给的physical BYTE3参考照片；mono64走另外的code2路径。
function prepareSuppliedReferencePhoto64({data,width,height,stride,format,rounding}){
 if(![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||width*height>80000000)throw RangeError('参考照片64供给尺寸限2..32766/80MP');
 if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width*3||!Number.isSafeInteger(stride*height)||data.length<stride*height||
  ![300,301].includes(format)||rounding!=='nearest-even')throw TypeError('参考照片64供给布局/RN无效');
 const output=new Uint8Array(64*64*3);
 if(width===64&&height===64){
  for(let y=0;y<64;y++)output.set(data.subarray(y*stride,y*stride+192),y*192);
 }else if(width===128&&height===128){
  // CVflag1在双轴精确2:1时改走flag3，BYTE3四点整数平均。
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)for(let c=0;c<3;c++){
   const p=y*2*stride+x*6+c;
   output[(y*64+x)*3+c]=(data[p]+data[p+3]+data[p+stride]+data[p+stride+3]+2)>>2;
  }
 }else{
  const xp=plan(width,true),yp=plan(height,false);
  for(let y=0;y<64;y++){
   const [iy,b0,b1]=yp[y],y0=Math.max(0,Math.min(height-1,iy)),y1=Math.max(0,Math.min(height-1,iy+1));
   for(let x=0;x<64;x++){
    const [ix,a0,a1]=xp[x],x1=Math.min(width-1,ix+1);
    for(let c=0;c<3;c++){
     const h0=data[y0*stride+ix*3+c]*a0+data[y0*stride+x1*3+c]*a1;
     const h1=data[y1*stride+ix*3+c]*a0+data[y1*stride+x1*3+c]*a1;
     output[(y*64+x)*3+c]=((((h0>>4)*b0>>16)+((h1>>4)*b1>>16)+2)>>2);
    }
   }
  }
 }
 return {data:output,width:64,height:64,stride:192,format};
}
module.exports={prepareSuppliedReferencePhoto64};
