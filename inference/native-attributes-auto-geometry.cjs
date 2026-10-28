'use strict';
// Original templates and native F32 fit verified on controlled finite fixtures; JS trig remains a candidate.
const {nativeSimilarity,nativeSelected5Similarity}=require('./native-fit.cjs'),{attribute0MatrixFromNativeFit,attribute34Geometry}=require('./native-attribute-geometry.cjs'),templates=require('./assets/native-attributes/geometry-templates.json');
const {angleArguments}=require('./native-primary142.cjs');
const f=Math.fround;
function estimateAttributeGeometry(points){
 if(!Array.isArray(points)||points.length!==194||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw new RangeError('自动属性候选需要原194点');const p=points.map(v=>v.map(f));
 const fit0=new Float32Array(nativeSimilarity(p.slice(0,142),templates.attribute0).flat()),affine0=attribute0MatrixFromNativeFit(fit0);
 // 原1470cd510按SSE四lane归约；最终atan2与trig仍明确是JS候选。
 const angleArgumentsYX=angleArguments(Float32Array.from(p.slice(0,142).flat()),0),angle=f(Math.atan2(...angleArgumentsYX)),trig={sinAngle:f(Math.sin(angle)),cosAngle:f(Math.cos(angle)),sinNegativeAngle:f(Math.sin(f(-angle))),cosNegativeAngle:f(Math.cos(f(-angle)))};
 const geometry34=attribute34Geometry(p,trig),affine86=new Float32Array(nativeSelected5Similarity([26,44,57,73,83].map(i=>p[i]),templates.attribute86).flat());
 const aligned=p.map(([x,y])=>[f(f(f(y*affine86[1])+f(x*affine86[0]))+affine86[2]),f(f(f(y*affine86[4])+f(x*affine86[3]))+affine86[5])]),minX=Math.min(...aligned.map(v=>v[0])),maxX=Math.max(...aligned.map(v=>v[0])),shift=f(56-f(f(f(maxX-minX)*f(.5))+minX));affine86[2]=f(affine86[2]+shift);
 return {affine0,affine34:geometry34.affine,affine86,angleArgumentsYX,angleRadians:angle,trig,fit0,geometry34,horizontalShift86:shift,solver:'recovered native F32 fit and SSE angle arguments/templates/formulas verified on controlled finite fixtures; independent JS atan2/trig and aligned-group layout candidate; native application/math runtime parity unverified',nativeApplicationParity:false};
}
module.exports={estimateAttributeGeometry};
