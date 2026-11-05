"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);},lum=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
// 三次可分离盒式滤波估计低频颜色；皮肤权重与颜色同时滤波，排除眼球和背景。
function lowFrequency(rgb,skin,width,height,radius){
 const a=new Float32Array(width*height*4),b=new Float32Array(a.length),n=radius*2+1;
 for(let i=0;i<skin.length;i++){for(let c=0;c<3;c++)a[i*4+c]=rgb[i*3+c]/255*skin[i];a[i*4+3]=skin[i];}
 for(let pass=0;pass<3;pass++){
  for(let y=0;y<height;y++)for(let c=0;c<4;c++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=a[(y*width+clamp(k,0,width-1))*4+c];for(let x=0;x<width;x++){b[(y*width+x)*4+c]=sum/n;sum+=a[(y*width+clamp(x+radius+1,0,width-1))*4+c]-a[(y*width+clamp(x-radius,0,width-1))*4+c];}}
  for(let x=0;x<width;x++)for(let c=0;c<4;c++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=b[(clamp(k,0,height-1)*width+x)*4+c];for(let y=0;y<height;y++){a[(y*width+x)*4+c]=sum/n;sum+=b[(clamp(y+radius+1,0,height-1)*width+x)*4+c]-b[(clamp(y-radius,0,height-1)*width+x)*4+c];}}
 }
 return a;
}
function correctUnderEye({rgb,skin,width,height,region,strength}){
 if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('祛黑眼圈强度无效');
 if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=512)||!(rgb instanceof Uint8Array)||rgb.length!==width*height*3||!(skin instanceof Float32Array)||skin.length!==width*height||!skin.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('祛黑眼圈工作数据无效');
 if(!region||!['origin','u','down'].every(k=>Array.isArray(region[k])&&region[k].length===2&&region[k].every(Number.isFinite))||!Number.isFinite(region.eyeWidth)||region.eyeWidth<4||!Number.isFinite(region.lower)||Math.abs(Math.hypot(...region.u)-1)>.001||Math.abs(Math.hypot(...region.down)-1)>.001||Math.abs(region.u[0]*region.down[0]+region.u[1]*region.down[1])>.001)throw Error('眼下区域坐标无效');
 const delta=new Float32Array(width*height*3);if(!strength)return {delta,changed:0};
 const local=(x,y)=>{const px=x-region.origin[0],py=y-region.origin[1];return [(px*region.u[0]+py*region.u[1])/region.eyeWidth,(px*region.down[0]+py*region.down[1]-region.lower)/region.eyeWidth];};
 const filtered=lowFrequency(rgb,skin,width,height,Math.max(1,Math.round(region.eyeWidth*.035))),samples=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(skin[i]<.75||filtered[i*4+3]<.4)continue;const [u,v]=local(x+.5,y+.5);if(u<-.55||u>.35||v<.62||v>.95)continue;const c=[0,1,2].map(k=>filtered[i*4+k]/filtered[i*4+3]);samples.push({u,v,c,l:lum(c)});}
 if(samples.length<12)return {delta,changed:0,referenceMissing:true};samples.sort((a,b)=>a.l-b.l);const trimmed=samples.slice(Math.floor(samples.length*.2),Math.ceil(samples.length*.8)),n=trimmed.length,mean=[0,0,0];let mx=0,my=0;
 for(const s of trimmed){mx+=s.u/n;my+=s.v/n;for(let c=0;c<3;c++)mean[c]+=s.c[c]/n;}if(lum(mean)<.04)return {delta,changed:0,referenceMissing:true};
 let xx=0,yy=0,xy=0;const xc=[0,0,0],yc=[0,0,0];for(const s of trimmed){const dx=s.u-mx,dy=s.v-my;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;for(let c=0;c<3;c++){xc[c]+=dx*(s.c[c]-mean[c]);yc[c]+=dy*(s.c[c]-mean[c]);}}
 const determinant=xx*yy-xy*xy,sx=mean.map((v,c)=>determinant>1e-9?(xc[c]*yy-yc[c]*xy)/determinant:0),sy=mean.map((v,c)=>determinant>1e-9?(yc[c]*xx-xc[c]*xy)/determinant:0);let changed=0;
 // 保留可信光照斜率，不能截低斜率后把正常渐变当成阴影；参考退化或外推过陡则跳过。
 if(determinant<=1e-9||mean.some((v,c)=>Math.abs(sx[c])>v*.6||Math.abs(sy[c])>v*.6))return {delta,changed:0,referenceUnreliable:true};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x;if(skin[i]<=0||filtered[i*4+3]<.25)continue;const [u,v]=local(x+.5,y+.5),q=(u/.55)**2+((v-.28)/.28)**2,regionWeight=smooth((1-q)/.4)*smooth(v/.1);if(!regionWeight)continue;
  const current=[0,1,2].map(c=>filtered[i*4+c]/filtered[i*4+3]),target=mean.map((value,c)=>clamp(value+sx[c]*(u-mx)+sy[c]*(v-my),0,1)),currentL=lum(current),targetL=lum(target);if(targetL<.04||currentL<.015)continue;
  const deficit=(targetL-currentL)/targetL,severity=smooth((deficit-.03)/.15);if(!severity)continue;
  const pixelL=(rgb[i*3]*.2126+rgb[i*3+1]*.7152+rgb[i*3+2]*.0722)/255,edge=smooth((pixelL/currentL-.25)/.4),amount=regionWeight*skin[i]*strength*severity*edge,lift=Math.max(0,Math.min(targetL-currentL,targetL*.35))*.55*amount;
  let maxChange=0;for(let c=0;c<3;c++){const colour=(target[c]*currentL/targetL-current[c])*.35*amount,d=clamp(lift*current[c]/currentL+colour,-.12,.12)*255;delta[i*3+c]=d;maxChange=Math.max(maxChange,Math.abs(d));}if(maxChange>=.5)changed++;
 }
 return {delta,changed,reference:{samples:n,mean,slopeX:sx,slopeY:sy}};
}
module.exports={correctUnderEye,lowFrequency};
