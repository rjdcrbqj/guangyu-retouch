'use strict';
const {nativeSkinGeometry,prepareNativeSkinInput}=require('./native-skin-geometry.cjs');
const {angleArguments}=require('./native-primary142.cjs');
const {projection}=require('./native-extra-projection.cjs');
const f=Math.fround,AREA=256*256,bits=a=>Array.from(new Uint32Array(a.buffer,a.byteOffset,a.length));
function prepareBrightEyeExtraInput({sourceRGB,sourceWH,source194}){
 if(!Array.isArray(sourceWH)||sourceWH.length!==2||!sourceWH.every(x=>Number.isSafeInteger(x)&&x>0&&x<=32768)||sourceWH[0]*sourceWH[1]>80000000||!(sourceRGB instanceof Uint8Array)||sourceRGB.length!==sourceWH[0]*sourceWH[1]*3)throw Error('眼部遮罩照片像素或尺寸无效');
 if(!(source194 instanceof Float32Array)||source194.length!==388||!source194.every(Number.isFinite))throw Error('眼部遮罩关键点无效');
 // Existing independent angle/trig choice, using this exact primary142 snapshot.
 // The subsequent FLOAT BGR sampling and projection are recovered finite kernels.
 const args=angleArguments(source194.subarray(0,284)),a=f(Math.atan2(args[0],args[1]));
 const trig={sinAngle:f(Math.sin(a)),cosAngle:f(Math.cos(a)),sinNegativeAngle:f(Math.sin(-a)),cosNegativeAngle:f(Math.cos(-a))};
 const points=Array.from({length:194},(_,i)=>[source194[2*i],source194[2*i+1]]),geometry=nativeSkinGeometry(points,trig);
 const prepared=projection({inverse:geometry.inverse,sourceWidth:sourceWH[0],sourceHeight:sourceWH[1],maskWidth:256,maskHeight:256});
 if(!prepared.columnMajor.every(Number.isFinite)||!prepared.normalized.every(Number.isFinite))throw Error('眼部遮罩投影无效');
 return {input:prepareNativeSkinInput({rgb:sourceRGB,width:sourceWH[0],height:sourceWH[1],nativeAffineFloat32:geometry.affine}),inverse:geometry.inverse,projectionBits:bits(prepared.columnMajor),normalizedBits:bits(prepared.normalized)};
}
function brightEyePlane3(values){
 if(!(values instanceof Float32Array)||values.length!==7*AREA||!values.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('眼部遮罩模型输出无效');
 const out=new Uint8Array(AREA);
 // Original raw index3 -> record+c8 -> RGBA.G. One-pixel borders are explicitly0.
 // Unchanged original fragment uses CVTTSS2SI then lowBYTE, not rounded SAT.
 for(let y=1;y<255;y++)for(let x=1;x<255;x++){const i=y*256+x;out[i]=Math.trunc(f(values[3*AREA+i]*255))&255;}
 return out;
}
module.exports={prepareBrightEyeExtraInput,brightEyePlane3};
