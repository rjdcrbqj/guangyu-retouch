'use strict';
const {meansAndCovariance,svd2,determinantOriginal}=require('./lib/fit-candidate.cjs');
const {fitPost}=require('./lib/fit-post-candidate.cjs');
const {inverse3x3F32,pointBounds,sourceClip}=require('./lib/source-geometry.cjs');
const {affineGemmOriginalCpuFalse}=require('./lib/gemm-candidate.cjs');
const f=Math.fround;
function finite(a,n,name){if(!(a instanceof Float32Array)||a.length!==n||!a.every(Number.isFinite))throw new TypeError(name+': finite Float32Array('+n+')');}
function fit194(a,b){
 finite(a,388,'source194');finite(b,388,'template194');
 const rows=x=>Array.from({length:194},(_,i)=>[x[i*2],x[i*2+1]]);
 const pre=meansAndCovariance(rows(a),rows(b)),svd=svd2(pre.covariance);
 const result=Float32Array.from(fitPost({...pre,...svd,determinantOriginal}).affine.flat());
 finite(result,6,'affine');return result;
}
//145be4f3a..4fb4: explicit no-preliminary-resize source points/INT origin.
function localSource194(points,origin){
 finite(points,388,'source194');if(!origin||origin.length!==2||!Array.from(origin).every(Number.isFinite))throw new TypeError('origin XY');
 const x=f(origin[0]),y=f(origin[1]),out=new Float32Array(388);
 for(let i=0;i<388;i+=2){out[i]=f(points[i]-x);out[i+1]=f(points[i+1]-y);}return out;
}
//145be552b..557a +145be55c0..55d5. Preserve the two distinct original F32 associations.
function align194F32(points,a){
 finite(points,388,'points194');finite(a,6,'affine');const out=new Float32Array(388);
 for(let i=0;i<388;i+=2){const x=points[i],y=points[i+1];out[i]=f(f(f(a[1]*y)+a[2])+f(a[0]*x));out[i+1]=f(f(a[3]*x)+f(f(a[4]*y)+a[5]));}
 return out;
}
//145be50b2..5157 +145be521f..5245: F32 subtraction, DOUBLE squared norms/division, F32 store.
// Unordered comparisons are retained for explicit degenerate numerical tests only.
function poseGate(points){
 finite(points,388,'source194');const x=points[108],y=points[109],lx=points[218],ly=points[219],rx=points[282],ry=points[283];
 const dxL=f(x-lx),dyL=f(y-ly),dxR=f(x-rx),dyR=f(y-ry);
 const ratio=f(Math.sqrt(dyL*dyL+dxL*dxL)/Math.sqrt(dyR*dyR+dxR*dxR));
 return {ratio,left:!(.11>ratio)&&lx<=x,right:!(9<ratio)&&!(rx<x)};
}
function prepareDarkCirclesGeometry({source194,sourceWH,template194}){
 finite(source194,388,'source194');finite(template194,388,'template194');
 if(!Array.isArray(sourceWH)||sourceWH.length!==2||!sourceWH.every(x=>Number.isInteger(x)&&x>0&&x<=2**24))throw new RangeError('sourceWH positive INT');
 const globalAffine=fit194(source194,template194),hom=Float32Array.from([...globalAffine,0,0,1]);
 const inverse3x3=inverse3x3F32(hom),mappedCorners=affineGemmOriginalCpuFalse(Float32Array.from([0,0,0,1536,1536,0,1536,1536]),inverse3x3.subarray(0,6));
 const modelSquareBounds=pointBounds(mappedCorners),ROI=sourceClip(modelSquareBounds,sourceWH);
 if(ROI[2]<=0||ROI[3]<=0)throw new RangeError('Empty sourceROI; original whole caller status not modeled');
 const local194=localSource194(source194,ROI.slice(0,2)),localAffine=fit194(local194,template194),aligned194=align194F32(local194,localAffine);
 return {globalAffine,inverse3x3,mappedCorners,modelSquareBounds,ROI,local194,localAffine,aligned194,poseGate:poseGate(source194)};
}
module.exports={fit194,localSource194,align194F32,poseGate,prepareDarkCirclesGeometry};
