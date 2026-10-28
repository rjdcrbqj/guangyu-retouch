'use strict';
const f=Math.fround;
function roundEven(x){const a=Math.floor(x),r=x-a;return r<.5?a:r>.5?a+1:a%2===0?a:a+1;}
function coefficients(sw,sh,w,h,cn){
 const sx=1/(w/sw),sy=1/(h/sh),xo=new Int32Array(w*cn),yo=new Int32Array(h),a=new Int16Array(w*cn*2),b=new Int16Array(h*2);
 for(let x=0;x<w;x++){let fx=f((x+.5)*sx-.5),ix=Math.floor(fx);fx=f(fx-ix);if(ix<0){ix=0;fx=0;}if(ix>=sw-1){ix=sw-1;fx=0;}for(let c=0;c<cn;c++){const i=x*cn+c;xo[i]=ix*cn+c;a[2*i]=roundEven(f(f(1-fx)*2048));a[2*i+1]=roundEven(f(fx*2048));}}
 for(let y=0;y<h;y++){let fy=f((y+.5)*sy-.5),iy=Math.floor(fy);fy=f(fy-iy);yo[y]=iy;b[2*y]=roundEven(f(f(1-fy)*2048));b[2*y+1]=roundEven(f(fy*2048));}return{xofs:xo,yofs:yo,alpha:a,beta:b};
}
function resizeByte(src,sw,sh,w,h,cn=3){
 if(!(src instanceof Uint8Array)||src.length!==sw*sh*cn||![1,3].includes(cn)||[sw,sh,w,h].some(n=>!Number.isInteger(n)||n<1||n>4096))throw Error('Finite BYTE C1/C3 ABI');
 if(sw===w&&sh===h)return Uint8Array.from(src);const out=new Uint8Array(w*h*cn);
 if(sw===w*2&&sh===h*2){for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<cn;c++){const i=(2*y*sw+2*x)*cn+c;out[(y*w+x)*cn+c]=(src[i]+src[i+cn]+src[i+sw*cn]+src[i+sw*cn+cn]+2)>>2;}return out;}
 const k=coefficients(sw,sh,w,h,cn),rows=[];
 for(let y=0;y<sh;y++){const row=new Int32Array(w*cn);for(let x=0;x<w*cn;x++){const i=y*sw*cn+k.xofs[x],j=Math.min(i+cn,(y+1)*sw*cn-1);row[x]=src[i]*k.alpha[2*x]+src[j]*k.alpha[2*x+1];}rows.push(row);}
 for(let y=0;y<h;y++){const y0=Math.max(0,Math.min(sh-1,k.yofs[y])),y1=Math.max(0,Math.min(sh-1,k.yofs[y]+1));for(let x=0;x<w*cn;x++)out[y*w*cn+x]=((((rows[y0][x]>>4)*k.beta[2*y])>>16)+(((rows[y1][x]>>4)*k.beta[2*y+1])>>16)+2)>>2;}return out;
}
module.exports={resizeByte,coefficients,roundEven};
