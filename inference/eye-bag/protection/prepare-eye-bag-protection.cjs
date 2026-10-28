'use strict';
// Pure numerical candidate. Native service, CPU dispatcher and whole caller excluded.
const {dilate,fillPolygon}=require('./lib/morphology.cjs');
const {selectPolygon,combineFinal,supportThreshold}=require('./lib/conversions.cjs');
const {boxBlurByte}=require('./lib/byte-box-blur.cjs');
const {warpByte}=require('./lib/byte-warp.cjs');
const {warpByteCrop}=require('./lib/warp-byte-crop.cjs');
const {resizeByte}=require('./lib/byte-resize.cjs');
const {inverse}=require('./lib/coordinates.cjs');
const SIZE=384,AREA=SIZE*SIZE,OUT=1024;
function dimensions(v,label,max=4096){if(!Array.isArray(v)||v.length!==2||!v.every(n=>Number.isInteger(n)&&n>=2&&n<=max)||v[0]*v[1]>80000000)throw RangeError(label+' explicit finite WH [2,'+max+'], area <=80000000');return v;}
function matrix(v,label){if(!(v instanceof Float32Array)||v.length!==6||!v.every(Number.isFinite))throw RangeError(label+' explicit 6F32');return v;}
function guardWarp(m,w,h){const z=inverse(Array.from(m));if(!z.every(Number.isFinite))throw RangeError('Nonfinite inverse');const lim=2147482623;for(const [a,b,c,n]of[[z[0],z[1],z[2],w],[z[3],z[4],z[5],w]]){if(Math.abs(a*(n-1)*1024)>lim)throw RangeError('Out of finite S32 warp-delta domain');for(const y of[0,h-1]){const base=(b*y+c)*1024;if(Math.abs(base)>lim||Math.abs(base+a*(w-1)*1024)>lim)throw RangeError('Out of finite S32 warp-coordinate domain');}}}
function satadd(a,b){if(a.length!==b.length)throw RangeError('BYTE sizes');const out=new Uint8Array(a.length);for(let i=0;i<out.length;i++)out[i]=Math.min(255,a[i]+b[i]);return out;}
function cropByte(data,w,h,roi){const[x,y,rw,rh]=roi;if(data.length!==w*h)throw RangeError('BYTE dimensions');const out=new Uint8Array(rw*rh);for(let j=0;j<rh;j++)out.set(data.subarray((y+j)*w+x,(y+j)*w+x+rw),j*rw);return out;}
function prepareEyeBagProtection({parsingPlanes,savedParsingInverse,fullsourceWH,workingResize=null,sourceROI,roiForward,aligned194,onStage=null}){
 // parsingPlanes is contiguous plane-major [N,384,384], N>=17. No proxy generated.
 if(!(parsingPlanes instanceof Uint8Array)||parsingPlanes.length%AREA||parsingPlanes.length/AREA<17||parsingPlanes.length/AREA>64)throw RangeError('Real supplied V2 BYTE planes: contiguous N x 384 x 384, 17<=N<=64');
 const directROI=workingResize===null&&onStage===null;
 const [fw,fh]=dimensions(fullsourceWH,'fullsourceWH',directROI?32766:4096);matrix(savedParsingInverse,'savedParsingInverse');matrix(roiForward,'roiForward');
 const [ww,wh]=workingResize===null?[fw,fh]:dimensions(workingResize,'workingResize');
 if(!Array.isArray(sourceROI)||sourceROI.length!==4||!sourceROI.every(Number.isInteger))throw RangeError('Explicit sourceROI XYWH');
 const [rx,ry,rw,rh]=sourceROI;if(rx<0||ry<0||rw<2||rh<2||rx+rw>ww||ry+rh>wh)throw RangeError('ROI must be wholly inside selected working image, >=2WH');
 if(!(aligned194 instanceof Float32Array)||aligned194.length!==388||!aligned194.every(v=>Number.isFinite(v)&&Math.abs(v)<=999999))throw RangeError('Explicit finite aligned194 XY F32; polygon coordinate domain');
 if(onStage!==null&&typeof onStage!=='function')throw TypeError('onStage callback');
 guardWarp(savedParsingInverse,fw,fh);guardWarp(roiForward,OUT,OUT);
 const put=(name,data,width,height)=>{if(onStage)onStage(name,data,{width,height});return data;};
 const plane=i=>parsingPlanes.subarray(i*AREA,(i+1)*AREA);
 const dil=(a,n,name,w=SIZE,h=SIZE)=>put(name,dilate({data:a,width:w,height:h,kernel:n}),w,h);
 const blur=(a,n,name,w=SIZE,h=SIZE)=>put(name,boxBlurByte({data:a,width:w,height:h,kernel:n}),w,h);
 const p16=blur(dil(plane(16),4,'dilateP16'),5,'processedP16');
 const a=blur(dil(satadd(satadd(plane(4),plane(5)),plane(6)),2,'dilateA'),3,'processedA');
 const d=dil(plane(8),9,'dilateD');
 const combined=put('combinedBYTE',satadd(satadd(satadd(satadd(a,plane(1)),satadd(satadd(plane(0),plane(14)),p16)),satadd(plane(9),plane(10))),d),SIZE,SIZE);
 function project(data,name){
  if(directROI){const roi=warpByteCrop(data,SIZE,SIZE,savedParsingInverse,fw,fh,sourceROI,1);return warpByte(roi,rw,rh,roiForward,OUT,OUT,1);}
  const full=put(name+'-fullsource',warpByte(data,SIZE,SIZE,savedParsingInverse,fw,fh,1),fw,fh);
  // Explicit workingResize means caller already selected this resize branch.
  const working=workingResize===null?full:put(name+'-working',resizeByte(full,fw,fh,ww,wh,1),ww,wh);
  const roi=put(name+'-ROI',cropByte(working,ww,wh,sourceROI),rw,rh);
  return put(name,warpByte(roi,rw,rh,roiForward,OUT,OUT,1),OUT,OUT);
 }
 const m=project(combined,'projectedM');
 function polygon(which){const flat=selectPolygon(aligned194,which),points=[];for(let i=0;i<flat.length;i+=2)points.push([flat[i],flat[i+1]]);return put('polygon'+which,fillPolygon({points,width:OUT,height:OUT}),OUT,OUT);}
 const q=blur(dil(polygon('Q'),19,'dilateQ',OUT,OUT),9,'blurQ',OUT,OUT);
 const r=blur(polygon('R'),15,'blurR',OUT,OUT);
 const cache1c8=put('cache1c8',combineFinal(m,q,r),OUT,OUT);
 const support=project(satadd(plane(2),p16),'projectedSupport');
 const cache228=put('cache228',supportThreshold(support),OUT,OUT);
 return {cache1c8,cache228,width:OUT,height:OUT};
}
module.exports={prepareEyeBagProtection,satadd,cropByte};
