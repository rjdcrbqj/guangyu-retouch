'use strict';
const {meansAndCovariance,svd2,determinantOriginal}=require('./lib/fit-candidate.cjs');
const {fitPost}=require('./lib/fit-post-candidate.cjs');
const {affineGemmCandidate,pointBounds}=require('./lib/source-geometry.cjs');
const {mouth22Box}=require('./lib/mouth-box.cjs');
const {corners,clip}=require('./lib/roi.cjs');
const f=Math.fround;
function inverseAffine(a){
 if(!(a instanceof Float32Array)||a.length!==6||!a.every(Number.isFinite))throw Error('finite supplied F32 affine');
 const [a0,a1,a2,a3,a4,a5]=a,det=f(f(a0*a4)-f(a3*a1));if(det===0||!Number.isFinite(det))throw Error('nonsingular affine required');
 const q=f(1/det),out=Float32Array.from([f(a4*q),f(-a1*q),0,f(-a3*q),f(a0*q),0]);
 out[2]=f(f(-out[0]*a2)-f(a5*out[1]));out[5]=f(f(-out[3]*a2)-f(a5*out[4]));return out;
}
function fit142(source,target){
 const rows=x=>Array.from({length:142},(_,i)=>[x[i*2],x[i*2+1]]);
 const pre=meansAndCovariance(rows(source),rows(target)),svd=svd2(pre.covariance);
 return Float32Array.from(fitPost({...pre,...svd,determinantOriginal}).affine.flat());
}
function compose(a,xy,g){
 const [x,y]=xy.map(f),s=g[0];return Float32Array.from([f(a[0]*s),f(a[1]*s),f(f(f(f(f(x*a[0])+a[2])+f(y*a[1]))*s)+g[2]),f(a[3]*s),f(a[4]*s),f(f(f(f(f(x*a[3])+a[5])+f(y*a[4]))*s)+g[5])]);
}
function prepare({source194,sourceWH,target142}){
 if(!(source194 instanceof Float32Array)||source194.length!==388||!source194.every(Number.isFinite)||!(target142 instanceof Float32Array)||target142.length!==284||!target142.every(Number.isFinite))throw Error('finite supplied 194/142 point arrays');
 const affine=fit142(source194.subarray(0,284),target142),aligned142=affineGemmCandidate(source194.subarray(0,284),affine),padding=new Float32Array(388);padding.set(aligned142);
 const mouthBox=mouth22Box(padding,1152,1536),cx=f(f(mouthBox[2]*f(.5))+mouthBox[0]),cy=f(f(f(.5)*mouthBox[3])+mouthBox[1]),scale=f(435.2/Math.max(mouthBox[2],mouthBox[3]));
 const inverse=inverseAffine(affine),cornerPoints=corners(scale,cx,cy),mapped=affineGemmCandidate(cornerPoints,inverse),bounds=pointBounds(mapped),ROI=clip(bounds,...sourceWH);
 if(ROI[2]<=0||ROI[3]<=0)throw Error('empty sourceROI');
 const globalScale=Float32Array.from([scale,0,f(f(256)-f(cx*scale)),0,scale,f(f(256)-f(cy*scale))]),composed=compose(affine,Array.from(ROI.subarray(0,2)),globalScale),final=composed.slice();
 const height=f(mouthBox[3]*scale)<=384?384:512;if(height===384)final[5]=f(final[5]+f(-64));
 return {affine,aligned142,mouthBox,inverse,corners:cornerPoints,mapped,globalScale,composed,final,bounds,ROI,modelWH:[512,height],center:[cx,cy],scale};
}
module.exports={inverseAffine,fit142,compose,prepare};
