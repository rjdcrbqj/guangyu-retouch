'use strict';
const {meansAndCovariance,svd2,determinantOriginal}=require('./lib/fit-candidate.cjs');
const {fitPost}=require('./lib/fit-post-candidate.cjs');
const f=Math.fround;
function finite6(a){if(!(a instanceof Float32Array)||a.length!==6||!a.every(Number.isFinite))throw TypeError('six supplied finite F32');return a;}
function fit194(source,target){
 for(const a of [source,target])if(!(a instanceof Float32Array)||a.length!==388||!a.every(Number.isFinite))throw TypeError('194 finite XY F32 pairs');
 const rows=a=>Array.from({length:194},(_,i)=>[a[2*i],a[2*i+1]]),pre=meansAndCovariance(rows(source),rows(target)),svd=svd2(pre.covariance);
 return Float32Array.from(fitPost({...pre,...svd,determinantOriginal}).affine.flat());
}
function inverseAffine(a){
 finite6(a);const [a0,a1,a2,a3,a4,a5]=a,det=f(f(a0*a4)-f(a3*a1));if(det===0||!Number.isFinite(det))throw RangeError('explicit nonsingular finite range only');
 const q=f(1/det),out=Float32Array.from([f(a4*q),f(-a1*q),0,f(-a3*q),f(a0*q),0]);out[2]=f(f(-out[0]*a2)-f(a5*out[1]));out[5]=f(f(-out[3]*a2)-f(a5*out[4]));return out;
}
function half(a){return Float32Array.from(finite6(a),v=>f(v*f(.5)));}
function resultROI({inverse,fullWH,headWH=[384,384]}){
 finite6(inverse);if(![...fullWH,...headWH].every(Number.isInteger)||fullWH.some(v=>v<2||v>32766)||headWH.some(v=>v<0||v>32766))throw RangeError('explicit finite bounded INT dimensions');
 const [a,b,c,d,e,g]=inverse,[w,h]=headWH.map(f),corners=[[c,g],[f(f(h*b)+c),f(f(h*e)+g)],[f(f(w*a)+c),f(f(w*d)+g)],[f(f(f(w*a)+f(h*b))+c),f(f(f(w*d)+f(h*e))+g)]];
 if(corners.flat().some(v=>!Number.isFinite(v)||v<=-2147483648||v>=2147483648))throw RangeError('bounded CVTTSS2SI only');
 const xy=corners.map(p=>p.map(v=>Math.trunc(v)|0)),min=[fullWH[0]-1,fullWH[1]-1],max=[-1,-1];
 for(const p of xy)for(let i=0;i<2;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 for(let i=0;i<2;i++){min[i]=Math.min(Math.max(min[i],0),fullWH[i]);max[i]=Math.max(Math.min(max[i],fullWH[i]),0);}
 return Int32Array.from([min[0],min[1],max[0]-min[0],max[1]-min[1]]);
}
function prepareFitGeometry({source194,target194,fullWH}){const inputForward=fit194(source194,target194),residualForward=half(inputForward),residualInverse=inverseAffine(residualForward);return {inputForward,residualForward,residualInverse,ROI:resultROI({inverse:residualInverse,fullWH})};}
module.exports={fit194,inverseAffine,half,resultROI,prepareFitGeometry};

module.exports.prepare=prepareFitGeometry;
