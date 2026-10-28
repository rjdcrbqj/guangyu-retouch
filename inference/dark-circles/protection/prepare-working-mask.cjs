'use strict';
// Explicit single-face numerical candidate. Native service, full MatExpr,
// FilterEngine and actual CPU selection are outside this finite contract.
const {erode,dilate,fillPolygon}=require('./lib/morphology.cjs');
const {boxBlurByte}=require('./lib/byte-box-blur.cjs');
const {warpByte}=require('./lib/byte-warp.cjs');
const {resizeByte}=require('./lib/byte-resize.cjs');
const {inverse}=require('./lib/coordinates.cjs');
const F=Math.fround,SIZE=512;
function wh(v,label,max=4096){if(!Array.isArray(v)||v.length!==2||!v.every(n=>Number.isInteger(n)&&n>=2&&n<=max))throw RangeError(label+' explicit WH [2,'+max+']');return v;}
function points(v){if(!(v instanceof Float32Array)||v.length!==388||!v.every(n=>Number.isFinite(n)&&Math.abs(n)<=999999))throw RangeError('Explicit SOURCE194 XY Float32Array');return v;}
function gemm3(a,b){const c=new Float32Array(9);for(let i=0;i<3;i++)for(let j=0;j<3;j++)c[i*3+j]=F(F(F(a[i*3]*b[j])+F(a[i*3+1]*b[3+j]))+F(a[i*3+2]*b[6+j]));return c;}
function featureMatrix(savedParsingInverse,fullsourceWH,savedParsingWH,sourceROI){
 if(!(savedParsingInverse instanceof Float32Array)||savedParsingInverse.length!==6||!savedParsingInverse.every(Number.isFinite))throw RangeError('Explicit savedParsingInverse 6F32');
 const [fw,fh]=wh(fullsourceWH,'fullsourceWH',32766),[sw,sh]=wh(savedParsingWH,'savedParsingWH',32766);
 if(!Array.isArray(sourceROI)||sourceROI.length!==4||!sourceROI.every(Number.isInteger))throw RangeError('Explicit INT32 sourceROI XYWH');
 const[x,y,w,h]=sourceROI;if(x<0||y<0||w<2||h<2||w>4096||h>4096||x+w>fw||y+h>fh)throw RangeError('Source ROI inside fullsource WH[2,4096]');
 const r=Float32Array.of(F(512/F(w)),0,0,0,F(512/F(h)),0,0,0,1),t=Float32Array.of(1,0,F(-x),0,1,F(-y),0,0,1),s=Float32Array.of(F(F(fw)/F(sw)),0,0,0,F(F(fh)/F(sh)),0,0,0,1),m=Float32Array.of(...savedParsingInverse,0,0,1);
 return gemm3(gemm3(gemm3(r,t),s),m).slice(0,6);
}
function eyeClosed(source194){
 points(source194);
 const distance=(a,b)=>{const x=F(source194[a*2]-source194[b*2]),y=F(source194[a*2+1]-source194[b*2+1]);return F(Math.sqrt(F(F(x*x)+F(y*y))));};
 return distance(18,22)>F(5*distance(20,24))||distance(36,40)>F(5*distance(38,42));
}
function eyePolygon(source194,sourceROI,right=false){points(source194);const start=right?36:18,ids=Array.from({length:8},(_,i)=>start+i);ids.push(start);return ids.map(i=>[Math.trunc(F(source194[i*2]-F(sourceROI[0]))),Math.trunc(F(source194[i*2+1]-F(sourceROI[1])))]);}
function threshold16(x){const out=new Uint8Array(x.length);for(let i=0;i<x.length;i++)out[i]=x[i]>16?255:0;return out;}
function maximum(a,b){if(a.length!==b.length)throw RangeError('BYTE sizes');const out=new Uint8Array(a.length);for(let i=0;i<out.length;i++)out[i]=Math.max(a[i],b[i]);return out;}
function guardWarp(m){const z=inverse(Array.from(m)),lim=2147482623;if(!z.every(Number.isFinite))throw RangeError('Nonfinite inverse');for(const[a,b,c]of[[z[0],z[1],z[2]],[z[3],z[4],z[5]]]){if(Math.abs(a*511*1024)>lim)throw RangeError('Out of explicit finite S32 warp domain');for(const y of[0,511]){const base=(b*y+c)*1024;if(Math.abs(base)>lim||Math.abs(base+a*511*1024)>lim)throw RangeError('Out of explicit finite S32 warp domain');}}}
function prepareWorkingMask({parsingVersion,parsingPlanes,planeWH,savedParsingInverse,savedParsingWH,fullsourceWH,sourceROI,source194,featureAvailable=true,onStage=null}){
 if(parsingVersion!==1&&parsingVersion!==2)throw RangeError('Explicit parsingVersion 1 or 2; no native default inferred');
 const [fw,fh]=wh(fullsourceWH,'fullsourceWH',32766);points(source194);
 if(onStage!==null&&typeof onStage!=='function')throw TypeError('onStage callback');
 if(!Array.isArray(sourceROI)||sourceROI.length!==4||!sourceROI.every(Number.isInteger))throw RangeError('Explicit INT32 sourceROI XYWH');
 const[rx,ry,rw,rh]=sourceROI;if(rx<0||ry<0||rw<2||rh<2||rw>4096||rh>4096||rx+rw>fw||ry+rh>fh)throw RangeError('Source ROI inside fullsource >=2WH');
 const matrix=featureAvailable===false?null:featureMatrix(savedParsingInverse,fullsourceWH,savedParsingWH,sourceROI);
 const put=(name,data,width=SIZE,height=SIZE)=>{if(onStage)onStage(name,data,{width,height});return data;};
 let projected,selectedPlane=null;
 if(featureAvailable===false){if(parsingPlanes!==null)throw RangeError('Unavailable feature requires explicit null planes');projected=put('projected',new Uint8Array(SIZE*SIZE));}
 else{
  if(featureAvailable!==true)throw TypeError('featureAvailable boolean');const [pw,ph]=wh(planeWH,'planeWH'),area=pw*ph,slot=parsingVersion===1?1:2;
  if(!(parsingPlanes instanceof Uint8Array)||parsingPlanes.length%area||parsingPlanes.length/area<=slot||parsingPlanes.length/area>64)throw RangeError('Real supplied contiguous parsing BYTE planes');
  guardWarp(matrix);selectedPlane=slot;projected=put('projected',warpByte(parsingPlanes.subarray(slot*area,(slot+1)*area),pw,ph,matrix,SIZE,SIZE,1));
 }
 const eroded=put('eroded5',erode({data:projected,width:SIZE,height:SIZE,kernel:5}));let cache170=new Uint8Array(eroded.length);for(let i=0;i<eroded.length;i++)cache170[i]=255-eroded[i];cache170=put('inverted',cache170);
 const closed=eyeClosed(source194);
 if(closed){
  const a=fillPolygon({points:eyePolygon(source194,sourceROI),width:rw,height:rh}),b=fillPolygon({points:eyePolygon(source194,sourceROI,true),width:rw,height:rh});const polygon=put('polygonROI',maximum(a,b),rw,rh);
  const resized=put('polygon512',resizeByte(polygon,rw,rh,SIZE,SIZE,1)),threshold=put('threshold16',threshold16(resized)),dilated=put('dilated11',dilate({data:threshold,width:SIZE,height:SIZE,kernel:11})),blurred=put('blurred11',boxBlurByte({data:dilated,width:SIZE,height:SIZE,kernel:11}));cache170=maximum(cache170,blurred);
 }
 put('cache170',cache170);return {cache170,width:SIZE,height:SIZE,selectedPlane,eyeClosed:closed,projectionMatrix:matrix};
}
module.exports={prepareWorkingMask,featureMatrix,gemm3,eyeClosed,eyePolygon,threshold16,maximum};
