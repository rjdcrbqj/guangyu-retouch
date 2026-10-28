'use strict';
const f=Math.fround, THRESHOLD=f(.001), AREA_RATIO=f(.9);
function validate(x,w,h){if(!(x instanceof Float32Array)||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>4096||h>4096||x.length!==w*h)throw new Error('Expected explicit contiguous F32 C1 plane');}
// 原标量DOUBLE阈值转换到F32后，CMP_GT输出0/255；NaN比较结果为false。
function threshold(x,w,h){validate(x,w,h);const out=new Uint8Array(x.length);for(let i=0;i<x.length;i++)out[i]=x[i]>THRESHOLD?255:0;return out;}
function bbox(x,w,h){if(w%4!==0)throw new Error('Original BYTE bbox candidate requires contiguous pointerMod4=0 and width multiple of4; native narrow-layout diagnostic excluded');if(!(x instanceof Uint8Array)||x.length!==w*h)throw new Error('Expected BYTE C1');let l=w,t=h,r=-1,b=-1;for(let y=0;y<h;y++)for(let u=0;u<w;u++)if(x[y*w+u]){l=Math.min(l,u);t=Math.min(t,y);r=Math.max(r,u);b=Math.max(b,y);}return r<0?[0,0,0,0]:[l,t,r-l+1,b-t+1];}
function cropRect(x,w,h){const q=bbox(threshold(x,w,h),w,h);if(q[2]<=0||q[3]<=0)return [0,0,w,h];const u=Math.max(4,q[0])-4,v=Math.max(4,q[1])-4;return [u,v,Math.min(q[2]+8,w-u),Math.min(q[3]+8,h-v)];}
// sourceWH是caller的R8 source ROI WH；固定模型遮罩WH不是此字段。
function accept(x,w,h,sourceWH){validate(x,w,h);if(!Array.isArray(sourceWH)||sourceWH.length!==2||sourceWH.some(v=>!Number.isInteger(v)||v<0||v>4096))throw new Error('Expected explicit source ROI WH');const full=[0,0,w,h],area=(sourceWH[0]*sourceWH[1])|0;let q=[0,0,0,0];if(area>0&&((w*h)|0)>area)q=cropRect(x,w,h);const ok=q[2]>0&&q[3]>0&&w>0&&h>0&&(q[2]!==w||q[3]!==h)&&f(f((w*h)|0)*AREA_RATIO)>f((q[2]*q[3])|0);return {accepted:ok,rect:ok?q:full,computedExpanded:q};}
module.exports={THRESHOLD,AREA_RATIO,threshold,bbox,cropRect,accept};
