'use strict';
const f=Math.fround;
function finiteF32(data,length,name){if(!(data instanceof Float32Array)||data.length!==length||!data.every(Number.isFinite))throw new TypeError(`${name}: finite Float32Array(${length})`);}
// Literal original517B arithmetic: DOUBLE cofactors; det = third + (first-second).
// Whole original MatExpr dispatch/ownership is not implemented by this module.
function inverse3x3F32(m){
 finiteF32(m,9,'matrix');const [a,b,c,d,e,q,g,h,i]=m;
 const c00=e*i-q*h,c10=d*i-q*g,c20=d*h-e*g;
 const det=c*c20+(a*c00-b*c10);if(!Number.isFinite(det)||det===0)throw new RangeError('Singular source affine');
 const r=1/det;
 return Float32Array.from([c00*r,(h*c-i*b)*r,(b*q-c*e)*r,
  (q*g+(-i)*d)*r,(a*i+(-g)*c)*r,(c*d-a*q)*r,
  c20*r,(g*b+(-h)*a)*r,(a*e-b*d)*r],f);
}
function pointBounds(points){
 let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
 for(let k=0;k<points.length;k+=2){const x=points[k],y=points[k+1];if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>=2**30||Math.abs(y)>=2**30)throw new RangeError('Projected square out of finite bbox domain');l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
 l=Math.floor(l);t=Math.floor(t);r=Math.floor(r);b=Math.floor(b);return [l,t,(r-l+1)|0,(b-t+1)|0];
}
function sourceClip([x,y,w,h],[W,H]){const l=Math.min(W-1,Math.max(0,x)),t=Math.min(H-1,Math.max(0,y));const r=Math.max(0,Math.min(W-1,(x+w)|0)),b=Math.max(0,Math.min(H-1,(y+h)|0));return [l,t,(r-l)|0,(b-t)|0];}
// Modern CV4 GEMM reference candidate: three DOUBLE products accumulated then
// one F32 store. This has six-photo evidence, not original CPU dispatcher proof.
function affineGemmCandidate(points,a){
 const out=new Float32Array(points.length);
 for(let k=0;k<points.length;k+=2){const x=points[k],y=points[k+1];out[k]=f((x*a[0]+y*a[1])+a[2]);out[k+1]=f((x*a[3]+y*a[4])+a[5]);}
 return out;
}
function prepareEyeBagGeometry({source194,sourceWH,template194,nativeSimilarity}){
 finiteF32(source194,388,'source194');finiteF32(template194,388,'template194');
 if(!Array.isArray(sourceWH)||sourceWH.length!==2||!sourceWH.every(v=>Number.isInteger(v)&&v>=1&&v<=2**24))throw new RangeError('sourceWH positive INT');
 if(typeof nativeSimilarity!=='function')throw new TypeError('Original proven equal194 nativeSimilarity callback required');
 const rows=a=>Array.from({length:194},(_,j)=>[a[j*2],a[j*2+1]]),target=rows(template194);
 const fit=a=>{const result=Float32Array.from(nativeSimilarity(rows(a),target).flat());finiteF32(result,6,'fit');return result;};
 const globalAffine=fit(source194),hom=Float32Array.from([...globalAffine.subarray(0,3),...globalAffine.subarray(3,6),0,0,1]);
 const inverse3x3=inverse3x3F32(hom),square=Float32Array.from([0,0,0,1024,1024,0,1024,1024]);
 const mappedSquareCorners=affineGemmCandidate(square,inverse3x3.subarray(0,6));
 const modelSquareBounds=pointBounds(mappedSquareCorners),ROI=Int32Array.from(sourceClip(modelSquareBounds,sourceWH));
 if(ROI[2]<=0||ROI[3]<=0)throw new RangeError('Model square outside source image');
 const localSource194=new Float32Array(388),ox=f(ROI[0]),oy=f(ROI[1]);
 for(let j=0;j<388;j+=2){localSource194[j]=f(source194[j]-ox);localSource194[j+1]=f(source194[j+1]-oy);}
 const roiForward=fit(localSource194),aligned194=affineGemmCandidate(localSource194,roiForward);
 return {sourceWH:[...sourceWH],globalAffine,inverse3x3,mappedSquareCorners,modelSquareBounds:Int32Array.from(modelSquareBounds),ROI,localSource194,roiForward,aligned194,
  evidenceBoundary:'Explicit no-preliminary-resize source geometry. Original fit/bbox/INTclip/F32 local subtraction/inverse numeric fragment; corner/final GEMM candidate compared with six-photo modern CV4 reference. Full original caller/CPU dispatch not claimed.'};
}
module.exports={inverse3x3F32,pointBounds,sourceClip,affineGemmCandidate,prepareEyeBagGeometry};
