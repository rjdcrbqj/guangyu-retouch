'use strict';
const f=Math.fround;
function coefficients(sw,sh,w,h,cn){
 const sx=1/(w/sw),sy=1/(h/sh),xo=new Int32Array(w*cn),yo=new Int32Array(h),a=new Float32Array(w*cn*2),b=new Float32Array(h*2);
 let xmin=0,xmax=w;
 for(let x=0;x<w;x++){
  let fx=f((x+.5)*sx-.5),ix=Math.floor(fx);fx=f(fx-ix);
  if(ix<0){xmin=x+1;ix=0;fx=0;}
  if(ix>=sw-1){xmax=Math.min(xmax,x);ix=sw-1;fx=0;}
  for(let c=0;c<cn;c++){xo[x*cn+c]=ix*cn+c;a[2*(x*cn+c)]=f(1-fx);a[2*(x*cn+c)+1]=fx;}
 }
 for(let y=0;y<h;y++){let fy=f((y+.5)*sy-.5),iy=Math.floor(fy);fy=f(fy-iy);yo[y]=iy;b[2*y]=f(1-fy);b[2*y+1]=fy;}
 return {xofs:xo,yofs:yo,alpha:a,beta:b,xmin:xmin*cn,xmax:xmax*cn};
}
function resize(src,sw,sh,w,h,cn=1){
 if(!(src instanceof Float32Array)||src.length!==sw*sh*cn||![1,3].includes(cn)||[sw,sh,w,h].some(v=>!Number.isInteger(v)||v<1||v>4096))throw new Error('explicit finite F32 C1/C3 image required');
 if(!src.every(Number.isFinite))throw new Error('finite input required');
 if(sw===w&&sh===h)return new Float32Array(src);
 const o=new Float32Array(w*h*cn);
 if(sw===2*w&&sh===2*h){
  // Original mode1 promotes exact half resize to area branch; C3 scalar order.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<cn;c++){
   let i=((y*2)*sw+x*2)*cn+c;
   const a=src[i],b=src[i+cn],cc=src[i+sw*cn],d=src[i+sw*cn+cn];
   const sum=cn===1&&x<(w&~3)?f(f(a+b)+f(cc+d)):f(f(f(f(0+a)+b)+cc)+d);
   o[(y*w+x)*cn+c]=f(sum*.25);
  }
  return o;
 }
 const k=coefficients(sw,sh,w,h,cn),rows=[];
 for(let y=0;y<sh;y++){
  const row=new Float32Array(w*cn);
  for(let x=0;x<w*cn;x++){
   const i=y*sw*cn+k.xofs[x];
   row[x]=x>=k.xmax?src[i]:f(f(src[i]*k.alpha[2*x])+f(src[i+cn]*k.alpha[2*x+1]));
  }
  rows.push(row);
 }
 for(let y=0;y<h;y++){
  const y0=Math.max(0,Math.min(sh-1,k.yofs[y])),y1=Math.max(0,Math.min(sh-1,k.yofs[y]+1));
  for(let x=0;x<w*cn;x++)o[y*w*cn+x]=f(f(rows[y0][x]*k.beta[2*y])+f(rows[y1][x]*k.beta[2*y+1]));
 }
 return o;
}
function ramp(w,h){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<50||h<30)throw new Error('native valid ramp dimensions >=50x30');
 const o=new Float32Array(w*h);o.fill(1);
 for(let y=0;y<30;y++)o.fill(f(y/29),y*w,(y+1)*w);
 for(let j=0;j<30;j++){const y=h-30+j;o.fill(f(1-f(j/29)),y*w,(y+1)*w);}
 for(let y=0;y<h;y++){
  for(let x=0;x<50;x++)o[y*w+x]=f(x/49);
  for(let j=0;j<50;j++)o[y*w+w-50+j]=f(1-f(j/49));
  o[y*w+w-1]=0;
 }
 return o;
}
function fade(src,w,h){if(!(src instanceof Float32Array)||src.length!==w*h||!src.every(Number.isFinite))throw new Error('finite scalar field required');const r=ramp(w,h),o=new Float32Array(src.length);for(let i=0;i<o.length;i++)o[i]=f(src[i]*r[i]);return o;}
module.exports={coefficients,resize,ramp,fade};
