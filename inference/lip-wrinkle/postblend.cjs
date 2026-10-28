'use strict';
const {warpByte}=require('./lib/byte-warp.cjs'),{warpFloat}=require('./lib/float-warp.cjs');
const {inverseAffine}=require('./geometry.cjs');
const blend=require('./lib/blend.cjs');
const f=Math.fround;
// BYTE rectangular morphology: constant default0 for max,255 for min.
// This stage has CV4.12 reference coverage, not whole original morphology execution.
function rectMorph(a,w,h,r,max){
 if(!(a instanceof Uint8Array)||a.length!==w*h||!Number.isInteger(r)||r<0)throw Error('explicit BYTE rectangular domain');
 const tmp=new Uint8Array(a.length),out=new Uint8Array(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=max?0:255;for(let xx=Math.max(0,x-r);xx<=Math.min(w-1,x+r);xx++)v=max?Math.max(v,a[y*w+xx]):Math.min(v,a[y*w+xx]);tmp[y*w+x]=v;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=max?0:255;for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r);yy++)v=max?Math.max(v,tmp[yy*w+x]):Math.min(v,tmp[yy*w+x]);out[y*w+x]=v;}
 return out;
}
function close5(a,w,h){return rectMorph(rectMorph(a,w,h,2,true),w,h,2,false);}
function cropCanvas(rgb,mask,w,h,roiArea){
 let x0=w,y0=h,x1=-1,y1=-1;const n=w*h;
 if(roiArea>0&&roiArea<n)for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]>1){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 let rect=[0,0,w,h],crop=false;
 if(x1>=0){const x=Math.max(x0,4)-4,y=Math.max(y0,4)-4,bw=Math.min(x1-x0+9,w-x),bh=Math.min(y1-y0+9,h-y);crop=bw>0&&bh>0&&!(bw===w&&bh===h)&&f(f(n)*f(.9))>f(bw*bh);if(crop)rect=[x,y,bw,bh];}
 const out=new Uint8Array(rgb.length),m=new Uint8Array(mask.length),[x,y,bw,bh]=rect;
 for(let yy=y;yy<y+bh;yy++){const at=yy*w+x;out.set(rgb.subarray(at*3,(at+bw)*3),at*3);m.set(mask.subarray(at,at+bw),at);}
 return {rgb:out,mask:m,rect,crop};
}
function minResidual(old,model,a,b){
 const n=a.length,out=new Float32Array(n*3);
 for(let start=0;start<n;start+=65536){const end=Math.min(start+65536,n);out.set(blend.residualFromMinMasks({old:old.subarray(start*3,end*3),model:model.subarray(start*3,end*3),maskA:a.subarray(start,end),maskB:b.subarray(start,end),channels:3}),start*3);}
 return out;
}
function prepare(p){
 const {planes21,v2WH,savedInverse,savedWH,sourceWH,ROI,forward,modelWH,aligned,modelRGB,modelPlane3}=p;
 const [vw,vh]=v2WH,[mw,mh]=modelWH,[x,y,rw,rh]=ROI;
 // This leaf reads only raw slots8/9/10; append-composites17..20 are unnecessary.
 if(!(planes21 instanceof Uint8Array)||![17*vw*vh,21*vw*vh].includes(planes21.length))throw Error('explicit17 or21 typed BYTE planes required');
 const n=vw*vh,saturated=new Uint8Array(n);for(let i=0;i<n;i++)saturated[i]=Math.min(planes21[8*n+i]+Math.min(planes21[9*n+i]+planes21[10*n+i],255),255);
 const closed=close5(close5(saturated,vw,vh),vw,vh),maskAffine=new Float32Array(savedInverse),sx=f(f(sourceWH[0])/f(savedWH[0])),sy=f(f(sourceWH[1])/f(savedWH[1]));
 maskAffine[0]=f(maskAffine[0]*sx);maskAffine[1]=f(sx*maskAffine[1]);maskAffine[2]=f(f(-x)+maskAffine[2]);maskAffine[3]=f(maskAffine[3]*sy);maskAffine[4]=f(sy*maskAffine[4]);maskAffine[5]=f(f(-y)+maskAffine[5]);
 const inverse=inverseAffine(forward),roiMask=warpByte(closed,vw,vh,maskAffine,rw,rh,1),modelMask=warpByte(roiMask,rw,rh,forward,mw,mh,1),dilated=rectMorph(modelMask,mw,mh,8,true);
 const cropped=cropCanvas(modelRGB,modelPlane3,mw,mh,rw*rh),residual=minResidual(aligned,cropped.rgb,cropped.mask,dilated);
 return {saturated,closed,maskAffine,inverse,roiMask,modelMask,dilated,cropped,residual};
}
function render({prepared,sourceROI,ROI,modelWH,strength}){
 const [rw,rh]=ROI.slice(2),[mw,mh]=modelWH,s=f(strength),active=s>.005,effective=active&&Math.max(rw,rh)<300?f(s*f(.75)):s;
 const scaled=new Float32Array(prepared.residual);if(active)for(let i=0;i<scaled.length;i++)scaled[i]=f(scaled[i]*effective);
 const warped=warpFloat({data:scaled,width:mw,height:mh,channels:3,matrix:prepared.inverse,targetWidth:rw,targetHeight:rh}).data;
 const result=new Uint8Array(sourceROI.length),n=rw*rh;
 for(let start=0;start<n;start+=65536){const end=Math.min(start+65536,n);result.set(blend.applyRoundedResidual({old:sourceROI.subarray(start*3,end*3),residual:warped.subarray(start*3,end*3),channels:3}),start*3);}
 return {scaled,warped,result,effective,active};
}
function postMasks(original,modified,w,h){
 const diff=new Uint8Array(original.length),gray=new Uint8Array(w*h),inside=new Uint8Array(w*h),changed=new Uint8Array(w*h),compare=new Uint8Array(w*h),masked=new Uint8Array(w*h);
 for(let i=0;i<original.length;i++)diff[i]=Math.abs(original[i]-modified[i]);
 for(let i=0;i<w*h;i++){const k=i*3,g=(diff[k]*3735+diff[k+1]*19235+diff[k+2]*9798+16384)>>>15;gray[i]=g;inside[i]=g<=1?255:0;changed[i]=255-inside[i];compare[i]=g>1?255:0;masked[i]=compare[i]?g:0;}
 return {absdiff:diff,gray,inRange:inside,changed,compare,maskedGray:masked};
}
module.exports={rectMorph,close5,cropCanvas,minResidual,prepare,render,postMasks};
