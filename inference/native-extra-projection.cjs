'use strict';
// Complete original 143243c40 / 1460b6e70 finite numerical captures.
// Saved integer dimensions and literal-one scissor corners are part of the ABI.
const f=Math.fround;
function inverse3(values){
 const a=Float32Array.from(values);if(a.length!==9||!a.every(Number.isFinite))throw TypeError('finite F32 mat3 required');
 const [a0,a1,a2,a3,a4,a5,a6,a7,a8]=a,t0=a4*a8-a5*a7,t1=a3*a7-a4*a6,det=a2*t1+(a0*t0-(a3*a8-a5*a6)*a1);
 if(det===0)return new Float32Array(9);
 const d=1/det;
 return Float32Array.from([t0*d,(a7*a2-a8*a1)*d,(a1*a5-a2*a4)*d,(a5*a6+(-a8)*a3)*d,(a0*a8+(-a6)*a2)*d,(a2*a3-a0*a5)*d,t1*d,(a6*a1+(-a7)*a0)*d,(a0*a4-a1*a3)*d]);
}
function projection({inverse,sourceWidth,sourceHeight,maskWidth,maskHeight}){
 const v=Float32Array.from(inverse);if(v.length!==6||!v.every(Number.isFinite)||![sourceWidth,sourceHeight,maskWidth,maskHeight].every(x=>Number.isInteger(x)&&x>0))throw TypeError('explicit saved INT dimensions and finite affine required');
 const sx=f(1/f(sourceWidth)),sy=f(1/f(sourceHeight));
 const normalized=Float32Array.from([f(v[0]*sx),f(v[1]*sx),f(v[2]*sx),f(v[3]*sy),f(v[4]*sy),f(v[5]*sy),0,0,1]),i=inverse3(normalized);
 const rowMajor=Float32Array.from([f(i[0]/f(maskWidth)),f(i[1]/f(maskWidth)),f(i[2]/f(maskWidth)),f(i[3]/f(maskHeight)),f(i[4]/f(maskHeight)),f(i[5]/f(maskHeight)),0,0,1]);
 const columnMajor=Float32Array.from([rowMajor[0],rowMajor[3],rowMajor[6],rowMajor[1],rowMajor[4],rowMajor[7],rowMajor[2],rowMajor[5],rowMajor[8]]);
 return {normalized,inverse:i,rowMajor,columnMajor};
}
function scissor(normalized,maskWidth,maskHeight,outputWidth,outputHeight){
 const n=normalized,mw=f(maskWidth),mh=f(maskHeight),ow=f(outputWidth),oh=f(outputHeight),trunc=v=>{const t=Math.trunc(v);return t===0?0:t;};
 const corners=[[trunc(f(n[2]*ow)),trunc(f(n[5]*oh))],[trunc(f(f(f(f(n[1]*mh)+n[0])+n[2])*ow)),trunc(f(f(f(f(n[4]*mh)+n[3])+n[5])*oh))],[trunc(f(f(f(f(n[0]*mw)+n[1])+n[2])*ow)),trunc(f(f(f(f(n[3]*mw)+n[4])+n[5])*oh))],[trunc(f(f(f(f(n[0]*mw)+f(n[1]*mh))+n[2])*ow)),trunc(f(f(f(f(n[3]*mw)+f(n[4]*mh))+n[5])*oh))]];
 const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return [x,y,Math.max(...xs)-x,Math.max(...ys)-y];
}
module.exports={inverse3,projection,scissor};
