'use strict';
const {nativeSimilarity}=require('./native-fit.cjs'),{modelSquareBounds}=require('./opencv-runtime.cjs'),template=require('./assets/wrinkle/alignment-template.json');
const f=Math.fround;
function estimateGeometry194({points,width,height}){
 if(!Array.isArray(points)||points.length!==194||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||![width,height].every(n=>Number.isInteger(n)&&n>1))throw new RangeError('祛皱候选几何需要完整194点和照片尺寸');
 const p=points.map(v=>v.map(f)),fullAffine=new Float32Array(nativeSimilarity(p,template.points).flat()),{bounds,corners}=modelSquareBounds({affine:fullAffine,side:1536}),[x,y,w,h]=bounds;
 const left=Math.min(width-1,Math.max(0,x)),top=Math.min(height-1,Math.max(0,y)),right=Math.max(0,Math.min(width-1,x+w)),bottom=Math.max(0,Math.min(height-1,y+h)),roi=[left,top,right-left,bottom-top];if(roi[2]<1||roi[3]<1)throw new RangeError('人脸处理区域在照片外');
 const shifted=p.map(v=>[f(v[0]-left),f(v[1]-top)]),affine=new Float32Array(nativeSimilarity(shifted,template.points).flat());
 return {roi,affine,fullAffine,corners,solver:'recovered native F32 fit with original194 template verified on controlled finite fixtures; independent detector/search/trig upstream and CV bounds integration; native application parity unverified',nativeApplicationParity:false};
}
module.exports={estimateGeometry194};
