'use strict';
// Original resource1979284778/model0x86; ids5..8 have no inferred semantic names.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const ort=require('onnxruntime-node');
const f32=Math.fround,SIDE=112,AREA=SIDE*SIDE,SCALE=f32(0.007843137718737125);
const MODEL_SHA256='986c626595d05559bef1845d13217f91daef6261676ff17cef4ac66a71e41610';

function checkAffine(a){
 if(!(a instanceof Float32Array)||a.length!==6||!a.every(Number.isFinite))throw new Error('原 float32 affine 必须为六项有限 Float32Array');
}
function inverseAffine86(a){
 checkAffine(a);
 //1454f9d20: each native float operation is rounded independently.
 const det=f32(f32(a[0]*a[4])-f32(a[3]*a[1]));
 const reciprocal=det!==0?f32(1/det):0;
 const ia=f32(a[4]*reciprocal),id=f32(a[0]*reciprocal);
 const ib=f32(-a[1]*reciprocal),ic=f32(-a[3]*reciprocal);
 const tx=f32(f32(-ia*a[2])-f32(ib*a[5]));
 const ty=f32(f32(-ic*a[2])-f32(a[5]*id));
 return new Float32Array([ia,ib,tx,ic,id,ty]);
}
function prepareAttribute86Input({rgb,width,height,nativeAffineFloat32}={}){
 checkAffine(nativeAffineFloat32);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||!(rgb instanceof Uint8Array)||rgb.length!==width*height*3)throw new Error('属性86原 RGB 照片像素或尺寸无效');
 const inv=inverseAffine86(nativeAffineFloat32),out=new Float32Array(AREA*3);
 // Caller supplies source→112 affine INCLUDING whole194 horizontal centering.
 //1446d03a0 promotes inverse floats to double and advances x in double.
 for(let y=0;y<SIDE;y++){
  let sx=y*inv[1]+inv[2],sy=y*inv[4]+inv[5];
  for(let x=0;x<SIDE;x++){
   const ix=Math.floor(sx),iy=Math.floor(sy),pixel=y*SIDE+x;
   const valid=ix>=0&&iy>=0&&ix<width-1&&iy<height-1;
   let tl=0,bl=0,tr=0,br=0,wBR=0,wBL=0,wTL=0,wTR=0;
   if(valid){
    const fx=f32(sx-ix),fy=f32(sy-iy),ox=f32(1-fx),oy=f32(1-fy);
    wBR=f32(fx*fy);wBL=f32(ox*fy);wTL=f32(ox*oy);wTR=f32(oy*fx);
    tl=(iy*width+ix)*3;tr=tl+3;bl=tl+width*3;br=bl+3;
   }
   for(let c=0;c<3;c++){
    let sample=0;
    if(valid){
     // 原callback先TL+TR，再BL，最后BR；保留各步F32舍入。
     sample=f32(f32(rgb[tl+c]*wTL)+f32(rgb[tr+c]*wTR));
     sample=f32(sample+f32(rgb[bl+c]*wBL));
     sample=f32(sample+f32(rgb[br+c]*wBR));
    }
    out[c*AREA+pixel]=f32(f32(sample-127.5)*SCALE);
   }
   sx+=inv[0];sy+=inv[3];
  }
 }
 return out;
}
function checkInput(input){
 if(!(input instanceof Float32Array)||input.length!==AREA*3||!input.every(Number.isFinite))throw new Error('属性86输入必须为有限 float32 [1,3,112,112]');
}
function checkManifest(m){
 if(m.resourceId!=='1979284778'||m.registeredModelId!=='0x86'||m.file!=='attribute86.onnx'||m.sha256!==MODEL_SHA256||m.input?.name!=='252'||m.output?.name!=='24'||JSON.stringify(m.input.shape)!=='[1,3,112,112]'||JSON.stringify(m.output.shape)!=='[1,4]')throw new Error('属性86原模型 manifest 合同无效');
 return m;
}
class NativeAttribute86{
 constructor({directory=path.join(__dirname,'assets','native-attributes')}={}){
  this.directory=directory;this.closed=false;this.activeRuns=new Set();this.sessionPromise=null;
 }
 async configuration(){
  if(!this.configPromise)this.configPromise=fs.readFile(path.join(this.directory,'manifest-86.json'),'utf8').then(text=>checkManifest(JSON.parse(text)));
  return this.configPromise;
 }
 session(){
  if(this.closed)return Promise.reject(new Error('属性86原模型后端已关闭'));
  if(!this.sessionPromise){
   const pending=(async()=>{
    const config=await this.configuration();
    if(this.closed)throw new Error('属性86原模型后端已关闭');
    const bytes=await fs.readFile(path.join(this.directory,config.file));
    if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw new Error('属性86原模型 SHA 校验失败');
    if(this.closed)throw new Error('属性86原模型后端已关闭');
    return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,logSeverityLevel:3});
   })();
   this.sessionPromise=pending;
   pending.catch(()=>{if(this.sessionPromise===pending)this.sessionPromise=null;});
  }
  return this.sessionPromise;
 }
 async run(input){
  if(this.closed)throw new Error('属性86原模型后端已关闭');
  checkInput(input);
  let finish;const active=new Promise(resolve=>{finish=resolve;});this.activeRuns.add(active);
  try{
   const session=await this.session();
   const result=await session.run({'252':new ort.Tensor('float32',input,[1,3,SIDE,SIDE])});
   const output=result['24'];
   if(!output||output.type!=='float32'||output.dims.length!==2||output.dims[0]!==1||output.dims[1]!==4||output.data.length!==4||!output.data.every(Number.isFinite))throw new Error('属性86原模型输出合同无效');
   return {5:output.data[0],6:output.data[1],7:output.data[2],8:output.data[3]};
  }finally{this.activeRuns.delete(active);finish();}
 }
 async infer(source){return this.run(prepareAttribute86Input(source));}
 async close(){
  this.closed=true;
  if(!this.closePromise)this.closePromise=(async()=>{
   await Promise.all(this.activeRuns);
   const session=this.sessionPromise;this.sessionPromise=null;
   if(session){const result=await Promise.allSettled([session]);if(result[0].status==='fulfilled')await result[0].value.release();}
  })();
  return this.closePromise;
 }
}
module.exports={inverseAffine86,prepareAttribute86Input,NativeAttribute86,MODEL_SHA256};
