import fs from 'node:fs/promises';
import {expand194} from './bright-eye/expanded414-candidate.mjs';
import {closeEyes} from './bright-eye/close-classifier-candidate.mjs';
import {eyeMaskWorld} from './bright-eye/eye-mask-world-candidate.mjs';
import {eyeCenterRadius,eyeGrid} from './bright-eye/eye-spline-candidate.mjs';
import sourceKernel from './bright-eye/source-candidate.cjs';
import highlightKernel from './bright-eye/highlight-candidate.cjs';

const f=Math.fround,fromBits=bits=>new Float32Array(Uint32Array.from(bits).buffer),toBits=values=>Array.from(new Uint32Array(Float32Array.from(values).buffer));
const pairs=values=>Array.from({length:values.length/2},(_,i)=>[values[2*i],values[2*i+1]]);
const template=JSON.parse(await fs.readFile(new URL('./bright-eye/template.json',import.meta.url),'utf8'));
const roundAway=x=>f(x<0?-Math.floor(-x+.5):Math.floor(x+.5));
function featureROI(expanded,indices,width,height){
 const xs=indices.map(i=>expanded[2*i]),ys=indices.map(i=>expanded[2*i+1]);
 const clamp=(x,n)=>f(Math.max(f(Math.min(roundAway(x),f(f(n)-1))),0));
 const x0=clamp(Math.min(...xs),width),y0=clamp(Math.min(...ys),height),x1=clamp(Math.max(...xs),width),y1=clamp(Math.max(...ys),height);
 return [x0,y0,f(x1-x0),f(y1-y0)];
}

// Actual +0 expansion branch; pixel coordinates and RGB source are explicit adapters.
// Original parent/13-point gate, F32 worlds, fixed gray/resize and highlight kernels
// were independently replayed. Original detector, protected loader and whole App differ.
export function prepareBrightEyeFace({sourceRGB,sourceWH,source194}){
 if(!Array.isArray(sourceWH)||sourceWH.length!==2||!sourceWH.every(n=>Number.isSafeInteger(n)&&n>0&&n<=32768)||sourceWH[0]*sourceWH[1]>80000000)throw Error('亮眼照片尺寸无效');
 const [w,h]=sourceWH;
 if(!(sourceRGB instanceof Uint8Array)||sourceRGB.length!==w*h*3)throw Error('亮眼照片像素无效');
 if(!(source194 instanceof Float32Array)||source194.length!==388||!source194.every(Number.isFinite))throw Error('亮眼关键点无效');
 const expanded=expand194(source194).points,closed=closeEyes(source194,expanded),points=pairs(source194),sides=[];
 for(const side of [1,0]){
  const ROI=featureROI(expanded,template.featureIndices[side],w,h),[x,y,cw,ch]=ROI;
  if(cw<=1||ch<=1||x+cw>=w||y+ch>=h)continue;
  const ref=template.templates.find(t=>t.side===side),corners=pairs(fromBits(ref.cornerBits));
  const isClosed=Boolean(side?closed.left:closed.right),world=eyeMaskWorld(points,pairs(fromBits(ref.xyBits)),corners,side,isClosed);
  const center=eyeCenterRadius(side?[points[27],points[31],points[35]]:[points[45],points[49],points[53]]);
  const ring=(side?[27,28,29,30,31,32,33,34]:[49,48,47,46,45,52,51,50]).map(i=>points[i]);
  const pupil=eyeGrid(ring,center.subarray(0,2),points[side?35:53]);
  const gray=sourceKernel.gray({data:sourceRGB.subarray((y*w+x)*3),width:cw,height:ch,channels:3,srcStep:w*3});
  const scaled=sourceKernel.resize({data:gray,width:cw,height:ch,targetWidth:200,targetHeight:200});
  const highlight=highlightKernel.maskFromGray({data:scaled,side:200,threshold:8,radius:3}).mask;
  if(!world.every(Number.isFinite)||!pupil.every(Number.isFinite))throw Error('亮眼网格退化');
  sides.push({side,ROI,closed:isClosed,worldBits:toBits(world),pupilBits:toBits(pupil),highlightBase64:Buffer.from(highlight).toString('base64')});
 }
 return {format:'guangyu-bright-eye-face',version:1,sourceWH:[w,h],sides};
}
