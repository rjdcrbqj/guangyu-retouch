'use strict';
// Independent JS candidate for the explicitly selected native arithmetic branch.
const f=Math.fround;
function reflect(p,n){if(n===1)return 0;while(p<0||p>=n)p=p<0?-p:2*n-p-2;return p;}
function box25(data,w,h){
 const rows=new Float64Array(w*h),out=new Float32Array(w*h),x=new Float64Array(w+24),sums=new Float64Array(w);
 for(let y=0;y<h;y++){
  for(let i=-12;i<w+12;i++)x[i+12]=data[y*w+reflect(i,w)];
  let s=((x[0]+x[1])+x[2])+x[3];for(let i=4;i<25;i++)s=x[i]+s;rows[y*w]=s;
  for(let i=0;i<w-1;i++){s=(x[i+25]-x[i])+s;rows[y*w+i+1]=s;}
 }
 for(let y=-12;y<12;y++){const r=reflect(y,h);for(let i=0;i<w;i++)sums[i]=rows[r*w+i]+sums[i];}
 for(let y=0;y<h;y++){const last=reflect(y+12,h),first=reflect(y-12,h);for(let i=0;i<w;i++){const v=sums[i]+rows[last*w+i];out[y*w+i]=f(v*(1/625));sums[i]=v-rows[first*w+i];}}
 return out;
}
function controls(o){
 const index=o.index||0;if(!Number.isInteger(index)||index<0||index>1023)throw Error('Explicit nonnegative face index domain');
 const ps=f(o.primaryValues&&index<o.primaryValues.length?o.primaryValues[index]:o.primaryStrength);
 const ss=f(o.secondaryValues&&index<o.secondaryValues.length?o.secondaryValues[index]:o.secondaryStrength);
 const bits=o.enableBits||Array(index+1).fill(o.secondaryEnabled);
 const enabled=index<bits.length?Boolean(bits[index]):true;
 if(!Number.isFinite(ps)||!Number.isFinite(ss))throw Error('Finite F32 controls');return {ps,ss,enabled};
}
function compose(o){
 const {width:w,height:h,primary,secondary,cache1c8,cache228}=o,n=w*h;
 if(!Number.isInteger(w)||!Number.isInteger(h)||Math.min(w,h)<1||Math.max(w,h)>4096)throw Error('Explicit finite plane dimensions');
 for(const a of [primary,secondary]){if(!(a instanceof Float32Array)||a.length!==n)throw Error('Supplied F32 plane');for(const v of a)if(!Number.isFinite(v))throw Error('Finite input');}
 for(const a of [cache1c8,cache228])if(!(a instanceof Uint8Array)||a.length!==n)throw Error('Supplied BYTE plane');
 for(const v of cache228)if(v>1)throw Error('Genuine binary instance output domain');
 const {ps,ss,enabled}=controls(o),st={};
 for(const k of ['normalizedProtection','instance','inverseProtection','primaryInstance','protected','output'])st[k]=new Float32Array(n);
 if(enabled){st.secondaryBlur=box25(secondary,w,h);for(const k of ['secondaryScaled','secondaryAttenuation','secondaryApplied'])st[k]=new Float32Array(n);}
 for(let i=0;i<n;i++){
  st.normalizedProtection[i]=f(f(cache1c8[i]*f(1/255))+0);st.instance[i]=cache228[i];
  st.inverseProtection[i]=f(1-st.normalizedProtection[i]);st.primaryInstance[i]=f(primary[i]*st.instance[i]);
  st.protected[i]=f(st.primaryInstance[i]*st.inverseProtection[i]);let a=st.protected[i];
  if(enabled){st.secondaryScaled[i]=f(f(st.secondaryBlur[i]*ss)+0);st.secondaryAttenuation[i]=f(1-st.secondaryScaled[i]);a=st.secondaryApplied[i]=f(a*st.secondaryAttenuation[i]);}
  // Original MatOp_AddEx assign: scale converts or scalar +/- paths, each with
  // the same +0 effect for finite values in this domain. This includes signed zero.
  st.output[i]=f(f(a*ps)+0);
 }
 return {stages:st,controls:{primaryStrengthBits:new Uint32Array(new Float32Array([ps]).buffer)[0],secondaryStrengthBits:new Uint32Array(new Float32Array([ss]).buffer)[0],secondaryEnabled:Number(enabled)}};
}
module.exports={compose,controls,box25};
