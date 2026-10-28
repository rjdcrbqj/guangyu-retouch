'use strict';
const f = Math.fround;
function valid(data,w,h,cn=1){if(!(data instanceof Float32Array)||data.length!==w*h*cn||!Number.isInteger(w)||!Number.isInteger(h)||Math.min(w,h)<1||Math.max(w,h)>4096)throw Error('Explicit finite F32 domain');for(const v of data)if(!Number.isFinite(v))throw Error('Nonfinite input');}
function reflect(p,n){if(n===1)return 0;while(p<0||p>=n)p=p<0?-p:2*n-p-2;return p;}
function box25({data,width:w,height:h}){
 valid(data,w,h);const rows=new Float64Array(w*h),out=new Float32Array(w*h),x=new Float64Array(w+24),sums=new Float64Array(w);
 for(let y=0;y<h;y++){
  for(let i=-12;i<w+12;i++)x[i+12]=data[y*w+reflect(i,w)];
  let s=0;for(let i=0;i<25;i++)s=x[i]+s;rows[y*w]=s;
  for(let i=0;i<w-1;i++){s=(x[i+25]-x[i])+s;rows[y*w+i+1]=s;}
 }
 for(let y=-12;y<12;y++){const r=reflect(y,h);for(let i=0;i<w;i++)sums[i]=rows[r*w+i]+sums[i];}
 for(let y=0;y<h;y++){const last=reflect(y+12,h),first=reflect(y-12,h);for(let i=0;i<w;i++){const v=sums[i]+rows[last*w+i];out[y*w+i]=f(v*(1/625));sums[i]=v-rows[first*w+i];}}
 return {data:out,rows};
}
function inverse(m){const [a,b,c,d,e,g]=m.map(f),det=a*e-b*d,q=det===0?0:1/det;const A=e*q,B=b*(-q),D=d*(-q),E=a*q;return [A,B,(-A)*c-B*g,D,E,(-D)*c-E*g];}
function roundEven(v){const a=Math.floor(v),r=v-a;return r<.5?a:r>.5?a+1:a%2===0?a:a+1;}
function coords(m,w,h){const inv=inverse(m),dx=new Int32Array(w),dy=new Int32Array(w),xy=new Int16Array(w*h*2),alpha=new Uint16Array(w*h);
 for(let x=0;x<w;x++){dx[x]=roundEven((inv[0]*x)*1024);dy[x]=roundEven((inv[3]*x)*1024);}
 for(let y=0;y<h;y++){const ox=(roundEven((inv[1]*y+inv[2])*1024)+16)|0,oy=(roundEven((inv[4]*y+inv[5])*1024)+16)|0;for(let x=0;x<w;x++){const X=(ox+dx[x])|0,Y=(oy+dy[x])|0,i=y*w+x;xy[i*2]=Math.max(-32768,Math.min(32767,X>>10));xy[i*2+1]=Math.max(-32768,Math.min(32767,Y>>10));alpha[i]=((X>>5)&31)|(((Y>>5)&31)<<5);}}
 return {inv,dx,dy,xy,alpha};
}
function remap({data,width:w,height:h,channels:cn=1,xy,alpha,targetWidth:tw,targetHeight:th}){
 valid(data,w,h,cn);if(![1,3].includes(cn)||xy.length!==tw*th*2||alpha.length!==tw*th)throw Error('Explicit remap ABI');const out=new Float32Array(tw*th*cn);
 function pixel(x,y,c){return x<0||x>=w||y<0||y>=h?0:data[(y*w+x)*cn+c];}
 for(let i=0;i<tw*th;i++){
  const x=xy[i*2],y=xy[i*2+1],fx=(alpha[i]&31)/32,fy=(alpha[i]>>5)/32;
  const weights=[f((1-fy)*(1-fx)),f((1-fy)*fx),f(fy*(1-fx)),f(fy*fx)];
  for(let c=0;c<cn;c++)out[i*cn+c]=f(f(f(f(pixel(x,y,c)*weights[0])+f(pixel(x+1,y,c)*weights[1]))+f(pixel(x,y+1,c)*weights[2]))+f(pixel(x+1,y+1,c)*weights[3]));
 }return out;
}
function warpFloat(o){valid(o.data,o.width,o.height,o.channels||1);const c=coords(o.matrix,o.targetWidth,o.targetHeight);return {data:remap({...o,xy:c.xy,alpha:c.alpha}),...c};}
module.exports={box25,warpFloat,remap,coords,inverse,reflect,roundEven};
