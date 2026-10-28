'use strict';
// Research candidate only. Geometry/quality/protection are explicit supplied fields.
const f=Math.fround,byte=require('./byte-candidate.cjs'),resize=require('./lib/float-resize.cjs'),warp=require('./lib/float-warp.cjs'),compose=require('./lib/compose.cjs'),row=require('./lib/byte-row.cjs');
function finite(a){if(!a.every(Number.isFinite))throw Error('Finite supplied values required');}
function savedInverse(m){const [a,b,c,d,e,g]=Array.from(m,f),q=f(1/f(f(a*e)-f(d*b))),A=f(e*q),B=f(-b*q),D=f(-d*q),E=f(a*q);return Float32Array.from([A,B,f(f(-A*c)-f(g*B)),D,E,f(f(-D*c)-f(g*E))]);}
const roiNative=require('./eye-rois-candidate.cjs'),trimNative=require('./crop-candidate.cjs');
function eyeROIs(p,q){if(p instanceof Float32Array&&p.length===388)p=Array.from({length:194},(_,i)=>[p[i*2],p[i*2+1]]);const r=roiNative.eyeROIs(p,q);if(r.status)throw Error('Original secondary ROI early reject; no model runs');return r.rects;}
function crop(a,w,h,roi,cn=1){const[x,y,rw,rh]=roi;if(x<0||y<0||rw<1||rh<1||x+rw>w||y+rh>h)throw Error('Explicit valid ROI');const o=new a.constructor(rw*rh*cn);for(let j=0;j<rh;j++)o.set(a.subarray(((y+j)*w+x)*cn,((y+j)*w+x+rw)*cn),j*rw*cn);return o;}
function insert(target,tw,roi,a,cn=1){const[x,y,w,h]=roi;if(a.length!==w*h*cn)throw Error('ROI copy dimensions');for(let j=0;j<h;j++)target.set(a.subarray(j*w*cn,(j+1)*w*cn),((y+j)*tw+x)*cn);}
function warpByte(a,w,h,m,tw,th,cn=3){
 const k=warp.coords(Array.from(m),tw,th),o=new Uint8Array(tw*th*cn),sample=(x,y,c)=>x<0||y<0||x>=w||y>=h?0:a[(y*w+x)*cn+c];
 for(let i=0;i<tw*th;i++){const x=k.xy[i*2],y=k.xy[i*2+1],fx=k.alpha[i]&31,fy=k.alpha[i]>>5;let weights=[(32-fx)*(32-fy)*32,fx*(32-fy)*32,(32-fx)*fy*32,fx*fy*32];if(weights[0]===32768)weights=[32767,0,0,1];for(let c=0;c<cn;c++){const v=sample(x,y,c)*weights[0]+sample(x+1,y,c)*weights[1]+sample(x,y+1,c)*weights[2]+sample(x+1,y+1,c)*weights[3];o[i*cn+c]=Math.max(0,Math.min(255,(v+16384)>>15));}}
 return o;
}
function normalize(a,w,h){const area=w*h,o=new Float32Array(area*3),scale=f(2/255);for(let i=0;i<area;i++)for(let c=0;c<3;c++)o[c*area+i]=f(f(a[i*3+c]-f(127.5))*scale);return o;}
function prepareInputs({source,width,height,geometry,quality,onStage=()=>{}}){
 if(!(source instanceof Uint8Array)||source.length!==width*height*3)throw Error('Physical RGB301 BYTE source required');
 const rois=eyeROIs(geometry.aligned194,quality),s=crop(source,width,height,geometry.ROI,3),aligned=warpByte(s,geometry.ROI[2],geometry.ROI[3],geometry.roiForward,1024,1024,3);onStage('aligned-rgb.u8',aligned);
 const inputs={};for(const key of ['left','right','secondary']){if(!rois[key]||!rois[key][2]||!rois[key][3])continue;const wh=key==='secondary'?[384,128]:[512,384],r=rois[key],v=byte.resizeByte(crop(aligned,1024,1024,r,3),r[2],r[3],...wh,3);onStage(key+'-input-rgb.u8',v);inputs[key]={data:normalize(v,...wh),dimensions:[1,3,wh[1],wh[0]]};onStage(key+'-input.f32',inputs[key].data);}return {rois,inputs};
}
function trim(mask,w,h,sourceWH){return trimNative.accept(mask,w,h,sourceWH).rect;}
function quantizeCorrected(raw,w,h,onNormalized=()=>{}){finite(raw);if(raw.length!==w*h*3)throw Error('CHW corrected tensor length');const o=new Uint8Array(raw.length),norm=new Float32Array(raw.length);for(let i=0;i<w*h;i++)for(let c=0;c<3;c++){const k=i*3+c;norm[k]=f(f(raw[c*w*h+i]+1)*f(127.5));o[k]=Math.max(0,Math.min(255,byte.roundEven(norm[k])));}onNormalized(norm);return o;}
function finish({source,width,height,geometry,rois,models,cache1c8,cache228,primaryStrength,secondaryStrength,secondaryEnabled=true,onStage=()=>{}}){
 const corrected=new Float32Array(1024*1024*3),primary=new Float32Array(1024*1024),secondary=new Float32Array(1024*1024),crops={};const sourceWH=Array.from(geometry.ROI).slice(2);
 for(const key of ['left','right']){if(!rois[key]||!rois[key][2]||!rois[key][3])continue;const raw=models[key],mask=raw.mask;finite(mask);const bytes=quantizeCorrected(raw.corrected,512,384,a=>onStage(key+'-normalized-corrected.f32',a)),r=trim(mask,512,384,sourceWH);crops[key]=r;onStage(key+'-corrected.u8',bytes);
  // Cached cropped region -> zero original-size canvas before ramp and resize.
  const cb=new Uint8Array(bytes.length),mb=new Float32Array(mask.length);insert(cb,512,r,crop(bytes,512,384,r,3),3);insert(mb,512,r,crop(mask,512,384,r));
  const faded=resize.fade(mb,512,384),rgb=Float32Array.from(cb);onStage(key+'-reconstructed-mask.f32',mb);onStage(key+'-faded-mask.f32',faded);
  const roi=rois[key],m=resize.resize(faded,512,384,roi[2],roi[3]),c=resize.resize(rgb,512,384,roi[2],roi[3],3);onStage(key+'-resized-mask.f32',m);onStage(key+'-resized-corrected.f32',c);insert(primary,1024,roi,m);insert(corrected,1024,roi,c,3);
 }
 const ss=models.secondary.mask;finite(ss);const rr=trim(ss,384,128,sourceWH),canvas=new Float32Array(ss.length);crops.secondary=rr;insert(canvas,384,rr,crop(ss,384,128,rr));const r=rois.secondary,sm=resize.resize(canvas,384,128,r[2],r[3]);insert(secondary,1024,r,sm);
 onStage('primary-aligned.f32',primary);onStage('corrected-aligned.f32',corrected);onStage('secondary-aligned.f32',secondary);
 const composed=compose.compose({width:1024,height:1024,primary,secondary,cache1c8,cache228,primaryStrength,secondaryStrength,secondaryEnabled});for(const[k,v]of Object.entries(composed.stages))onStage('compose-'+k+'.f32',v);
 const inverse=Array.from(savedInverse(geometry.roiForward)),[x,y,w,h]=geometry.ROI;onStage('saved-inverse.f32',Float32Array.from(inverse));
 const wc=warp.warpFloat({data:corrected,width:1024,height:1024,channels:3,matrix:inverse,targetWidth:w,targetHeight:h}).data,wm=warp.warpFloat({data:composed.stages.output,width:1024,height:1024,matrix:inverse,targetWidth:w,targetHeight:h}).data;onStage('source-corrected.f32',wc);onStage('source-mask.f32',wm);
 const out=Uint8Array.from(source),roiSrc=crop(source,width,height,geometry.ROI,3),roiDst=new Uint8Array(roiSrc.length);
 for(let j=0;j<h;j++){const res=row.blendRow(roiSrc.subarray(j*w*3,(j+1)*w*3),wc.subarray(j*w*3,(j+1)*w*3),wm.subarray(j*w,(j+1)*w),3,new Uint8Array(w*3));roiDst.set(res.output,j*w*3);}insert(out,width,geometry.ROI,roiDst,3);onStage('final-rgb.u8',out);return{output:out,crops,composed};
}
// Caller order is serial: each next face receives the updated mutable source.
async function runFace(o,infer){
 if(!Array.isArray(o.runtimeFlags)||o.runtimeFlags.length!==2)throw Error('Explicit original backend runtime flags required');
 if(o.runtimeFlags[0]&&o.runtimeFlags[1])throw Error('Combined backend pixels not supported by this sequential modern ORT candidate');
 const prepared=prepareInputs(o),models={},plan=roiNative.modelPlan(prepared.rois,o.runtimeFlags).models;
 for(const key of ['left','right','secondary'])if(prepared.inputs[key]){
  const raw=await infer(key,prepared.inputs[key]);if(raw?.backendStatus!==0)throw Object.assign(Error('Backend nonzero; original caller aborts later models'),{backendStatus:raw?.backendStatus,part:key});models[key]=raw;
 }
 return {...finish({...o,...prepared,models}),modelOrder:plan,rois:prepared.rois};
}
async function runFaces(o,infer){
 let mutable=Uint8Array.from(o.source);const records=[];
 for(const face of o.faces){const r=await runFace({...o,...face,source:mutable},(key,input)=>infer(face,key,input));mutable=r.output;records.push(r);}
 return {output:mutable,records};
}
module.exports={eyeROIs,savedInverse,crop,insert,warpByte,normalize,prepareInputs,trim,quantizeCorrected,finish,runFace,runFaces,modelPlan:roiNative.modelPlan};
