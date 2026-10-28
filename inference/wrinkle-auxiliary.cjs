'use strict';
// 原slot3/4属性分支调用原1110763825模型，输出保护mask，不产生独立修复RGB。
const {initializeOpenCV,resizeBytes,resizeFloat32,warpBytes}=require('./opencv-runtime.cjs');
const {inverseAffine}=require('./wrinkle-postprocess.cjs');
const f=Math.fround,SCALE=f(1/127.5);
function points194(points){if(!Array.isArray(points)||points.length!==194||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw new RangeError('辅助保护必须提供原194点');return points.map(p=>p.map(f));}
function auxiliaryDispatch({slot3,slot4,attribute0,attribute3,attribute4,attributeScores5678,getters34Succeeded}){
 if(!Array.isArray(attributeScores5678)||attributeScores5678.length!==4||!attributeScores5678.every(Number.isFinite)||![slot3,slot4,attribute0,attribute3,attribute4].every(Number.isFinite)||typeof getters34Succeeded!=='boolean')throw new RangeError('必须提供原属性值与getter状态');
 const scores=attributeScores5678.map(f);let winner=0;for(let i=1;i<4;i++)if(scores[i]>scores[winner])winner=i;
 const [s3,s4,a0,a3,a4]=[slot3,slot4,attribute0,attribute3,attribute4].map(f);
 return {active:(s3>0||s4>0)&&winner===2&&a0>10&&a0<40&&getters34Succeeded&&a3<a4,attributeWinnerId:winner+5,attribute0:a0,rawSlot3:s3,rawSlot4:s4};
}
function norm32(a,b){const x=f(a[0]-b[0]),y=f(a[1]-b[1]);return f(Math.sqrt(f(f(x*x)+f(y*y))));}
function visibilityFlags(rawPoints194){
 const p=points194(rawPoints194),dx1=f(p[54][0]-p[109][0]),dy1=f(p[54][1]-p[109][1]),dx2=f(p[54][0]-p[141][0]),dy2=f(p[54][1]-p[141][1]),den=Math.sqrt(dx2*dx2+dy2*dy2);
 if(den===0)throw new RangeError('原辅助可见性比值分母为零');const ratio=f(Math.sqrt(dx1*dx1+dy1*dy1)/den),badLeft=f(norm32(p[20],p[24])*5)<norm32(p[18],p[22]),badRight=f(norm32(p[38],p[42])*5)<norm32(p[36],p[40]);
 return {left:!badLeft&&p[109][0]<=p[54][0]&&ratio>=.11,right:!badRight&&p[54][0]<=p[141][0]&&ratio<=f(9),ratio,badLeft,badRight};
}
function patchSpecs({data,width,height,channels,alignedPoints194,visibility,photoFormat}){
 if(!(data instanceof Uint8Array)||data.length!==width*height*channels||![0x300,0x301,0x401,0x501].includes(photoFormat)||channels!==(photoFormat<0x400?3:4))throw new RangeError('必须提供原packed像素格式');
 const p=points194(alignedPoints194),patches=[];
 for(const [side,index] of [['left',18],['right',36]]){
  if(!visibility[side])continue;const cx=Math.trunc(p[index][0]),cy=Math.trunc(p[index][1]),clampX=v=>Math.max(0,Math.min(width-1,v)),clampY=v=>Math.max(0,Math.min(height-1,v));
  const x0=clampX(cx-256),y0=clampY(cy-256),x1=clampX(cx+256),y1=clampY(cy+256),w=x1-x0,h=y1-y0;if(!w||!h)continue;
  const cropped=new Uint8Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)cropped[(y*w+x)*3+c]=data[((y+y0)*width+x+x0)*channels+c];
  const resized=resizeBytes({data:cropped,width:w,height:h,channels:3,targetWidth:256,targetHeight:256}),input=new Float32Array(3*256*256),swap=photoFormat===0x300||photoFormat===0x501;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++)for(let c=0;c<3;c++){const xx=side==='right'?255-x:x,v=resized[(y*256+xx)*3+(swap?2-c:c)];input[c*65536+y*256+x]=f((v-127.5)*SCALE);}
  patches.push({side,centerIndex:index,roi:[x0,y0,x1,y1],photoFormat,input});
 }
 return patches;
}
function roundEven(v){const q=Math.floor(v),d=v-q;return d<.5?q:d>.5?q+1:q+(q%2);}
function maskByte(mask){if(!(mask instanceof Float32Array)||!mask.every(Number.isFinite))throw new RangeError('原辅助float mask无效');return Uint8Array.from(mask,v=>Math.max(0,Math.min(255,roundEven(f(Math.max(0,Math.min(1,v))*510)))));}
function placePredictions({width,height,patches,predictions}){
 if(patches.length!==predictions.length)throw new RangeError('原辅助预测数量无效');const out=new Uint8Array(width*height);
 for(let j=0;j<patches.length;j++){const patch=patches[j],prediction=predictions[j];if(!(prediction instanceof Float32Array)||prediction.length!==65536||!prediction.every(Number.isFinite))throw new RangeError('原256模型输出无效');let pred=prediction;
  if(patch.side==='right'){pred=new Float32Array(65536);for(let y=0;y<256;y++)for(let x=0;x<256;x++)pred[y*256+x]=prediction[y*256+255-x];}
  const [x0,y0,x1,y1]=patch.roi,w=x1-x0,h=y1-y0,a=maskByte(resizeFloat32({data:pred,width:256,height:256,channels:1,targetWidth:w,targetHeight:h}));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y+y0)*width+x+x0;out[i]=Math.max(out[i],a[y*w+x]);}
 }
 return out;
}
function warpToROI512({mask1536,forwardAffine,roiWidth,roiHeight}){const warped=warpBytes({data:mask1536,width:1536,height:1536,channels:1,affine:inverseAffine(forwardAffine),targetWidth:roiWidth,targetHeight:roiHeight,borderValue:0});return {data:resizeBytes({data:warped,width:roiWidth,height:roiHeight,channels:1,targetWidth:512,targetHeight:512}),width:512,height:512,warped};}
function mergeProtection(existing,incoming){if(!incoming||!(incoming.data instanceof Uint8Array)||incoming.data.length!==incoming.width*incoming.height)throw new RangeError('原保护mask尺寸无效');if(!existing)return {data:new Uint8Array(incoming.data),width:incoming.width,height:incoming.height};
 if(!(existing.data instanceof Uint8Array)||existing.data.length!==existing.width*existing.height)throw new RangeError('已有原保护mask无效');const resized=existing.width===incoming.width&&existing.height===incoming.height?incoming.data:resizeBytes({data:incoming.data,width:incoming.width,height:incoming.height,channels:1,targetWidth:existing.width,targetHeight:existing.height}),data=new Uint8Array(existing.data);for(let i=0;i<data.length;i++)data[i]=Math.max(data[i],resized[i]);return {data,width:existing.width,height:existing.height};}
function protectEncoded({encoded,mask,channels=3,confidence=null}){
 if(!(mask instanceof Uint8Array)||!(encoded instanceof Uint8Array)||![3,4].includes(channels)||encoded.length!==mask.length*channels)throw new RangeError('原编码保护尺寸无效');
 if(confidence!==null&&(!(confidence instanceof Float32Array)||confidence.length!==mask.length||!confidence.every(Number.isFinite)))throw new RangeError('原置信度无效');
 const result=new Uint8Array(encoded),outConfidence=confidence===null?null:new Float32Array(confidence);for(let i=0;i<mask.length;i++){const a=mask[i];for(let c=0;c<3;c++)result[i*channels+c]=Math.floor((encoded[i*channels+c]*(255-a)+80*a)/255);if(outConfidence&&a>1)outConfidence[i]=0;}return {encoded:result,confidence:outConfidence};
}
class OriginalAuxiliaryProtection{
 constructor({models}){if(!models||typeof models.run!=='function')throw new RangeError('必须使用原祛皱模型后端');this.models=models;}
 async run({data,width=1536,height=1536,channels=3,rawPoints194,alignedPoints194,photoFormat,forwardAffine,roiWidth,roiHeight,existingProtection=null,attributes,slot3,slot4,encoded=null,confidence=null}){
  const dispatch=auxiliaryDispatch({...attributes,slot3,slot4}),metadata={dispatch,active:dispatch.active,attributeSemantics:'original ids; no inferred labels',nativeApplicationParity:false};await initializeOpenCV();let protection1536=null,warpedROI=null,mergedProtection=existingProtection;
  if(dispatch.active){const visibility=visibilityFlags(rawPoints194),patches=patchSpecs({data,width,height,channels,alignedPoints194,visibility,photoFormat}),predictions=[];
   for(const patch of patches)predictions.push((await this.models.run('auxiliary256',{'150':patch.input}))['34'].data);
   protection1536=placePredictions({width,height,patches,predictions});metadata.prediction={visibility,patches:patches.map(({input,...p})=>p),originalModel:1110763825,maskByteScale:510,emptyStatus:protection1536.some(v=>v!==0)?0:1};
   if(!metadata.prediction.emptyStatus){const incoming=warpToROI512({mask1536:protection1536,forwardAffine,roiWidth,roiHeight});warpedROI=incoming.warped;mergedProtection=mergeProtection(existingProtection,incoming);}
  }
  let result={encoded:encoded===null?null:new Uint8Array(encoded),confidence:confidence===null?null:new Float32Array(confidence)};
  if(encoded!==null&&mergedProtection){const mask=mergedProtection.width===roiWidth&&mergedProtection.height===roiHeight?mergedProtection.data:resizeBytes({data:mergedProtection.data,width:mergedProtection.width,height:mergedProtection.height,channels:1,targetWidth:roiWidth,targetHeight:roiHeight}),encodedChannels=encoded.length/(roiWidth*roiHeight);result=protectEncoded({encoded,mask,channels:encodedChannels,confidence});}
  return {protection1536,warpedROI,mergedProtection,...result,metadata};
 }
}
module.exports={auxiliaryDispatch,visibilityFlags,patchSpecs,maskByte,placePredictions,warpToROI512,mergeProtection,protectEncoded,OriginalAuxiliaryProtection};
