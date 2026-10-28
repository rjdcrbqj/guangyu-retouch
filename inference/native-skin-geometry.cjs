'use strict';
const {attribute34Geometry}=require('./native-attribute-geometry.cjs');
const {prepareAttribute0Input}=require('./native-attribute034.cjs');
const {warpBytes}=require('./opencv-runtime.cjs');
const f=Math.fround;
//1470f52e0, shared1470f6a70. Trig values remain explicit: caller's automatic
//angle/math and point inference are independent candidates, not observed native state.
function nativeSkinGeometry(points,trig){
 const {bounds}=attribute34Geometry(points,trig),[x,y,w,h]=bounds;
 const cx=f(x+f(w*f(.5))),cy=f(y+f(h*f(.5)));
 const scale=f(f(f(1-f(.2))*f(256))/Math.max(w,h));
 const a=f(scale*f(trig.cosNegativeAngle)),b=f(f(-f(trig.sinNegativeAngle))*scale);
 const c=f(scale*f(trig.sinNegativeAngle)),d=f(scale*f(trig.cosNegativeAngle));
 const tx=f(f(128)+f(f(b*f(-cy))+f(a*f(-cx))));
 const ty=f(f(128)+f(f(c*f(-cx))+f(d*f(-cy))));
 const reciprocal=f(1/f(f(a*d)+f(f(-b)*c)));
 const ia=f(d*reciprocal),ic=f(f(-c)*reciprocal),ib=f(f(-b)*reciprocal),id=f(a*reciprocal);
 //1470f78c0 flags0x12; FaceParsing stores the column-major result as row-major6.
 const itx=f(f(f(-ib)*ty)-f(tx*ia)),ity=f(f(f(-id)*ty)-f(tx*ic));
 const affine=new Float32Array([a,b,tx,c,d,ty]),inverse=new Float32Array([ia,ib,itx,ic,id,ity]);
 if(!affine.every(Number.isFinite)||!inverse.every(Number.isFinite))throw new RangeError('原皮肤裁切点集无有效范围');
 return {bounds,scale,affine,inverse,side:256,sourcePointCount:142,margin:f(.2)};
}
function prepareNativeSkinInput(source){
 //Same recovered256 FLOAT BGR sampler as attribute0, with skin-specific affine.
 //This reuses pixel sampling only; it does not invoke the attribute0 model.
 return prepareAttribute0Input(source);
}
function nativeSkinProjectionAffine({inverse,sourceCoordinateWidth,sourceCoordinateHeight,targetWidth,targetHeight}){
 if(!(inverse instanceof Float32Array)||inverse.length!==6||!inverse.every(Number.isFinite)||![sourceCoordinateWidth,sourceCoordinateHeight].every(v=>Number.isFinite(v)&&v>0)||![targetWidth,targetHeight].every(v=>Number.isInteger(v)&&v>0))throw new RangeError('原皮肤投影参数无效');
 //142edca00: denominators are face-container FLOAT coordinate dimensions,
 //not FaceParsing's saved integer metadata. Scale includes each row translation.
 const sx=f(f(targetWidth)/f(sourceCoordinateWidth)),sy=f(f(targetHeight)/f(sourceCoordinateHeight));
 const affine=Float32Array.from(inverse,(v,i)=>f(v*(i<3?sx:sy)));
 if(!affine.every(Number.isFinite))throw new RangeError('原皮肤投影比例无效');
 return affine;
}
function projectNativeSkinPlane({plane,inverse,sourceCoordinateWidth,sourceCoordinateHeight,targetWidth,targetHeight}){
 const affine=nativeSkinProjectionAffine({inverse,sourceCoordinateWidth,sourceCoordinateHeight,targetWidth,targetHeight});
 //Single plane1: no threshold, max combine or extra feather pass.
 return warpBytes({data:plane,width:256,height:256,channels:1,affine,targetWidth,targetHeight,borderValue:0});
}
module.exports={nativeSkinGeometry,prepareNativeSkinInput,nativeSkinProjectionAffine,projectNativeSkinPlane};
