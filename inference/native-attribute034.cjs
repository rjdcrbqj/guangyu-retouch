'use strict';
// Original resources3941563283/model0x81 and970914372/model0x84; numeric ids only.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const ort=require('onnxruntime-node');
const {inverseAffine86}=require('./native-attribute86.cjs');
const f32=Math.fround,SCALE=f32(1/255);
const CONTRACTS=Object.freeze({
 attribute0:{resourceId:'3941563283',registeredModelId:'0x81',file:'attribute0.onnx',sha256:'aa3605bef83855aa2389f02249c19efb5c56eafdecb3af4331d16e9f90a0dc15',inputName:'11',side:256,outputName:'109',outputShape:[1]},
 attribute34:{resourceId:'970914372',registeredModelId:'0x84',file:'attribute34.onnx',sha256:'a24993f9a42938a22b685d0ff1734c2320ce30f01081f4768bfb367ef0fd375d',inputName:'21',side:146,outputName:'91',outputShape:[1,2]}
});
function contract(role){const c=CONTRACTS[role];if(!c)throw new Error('原属性0/34模型角色无效');return c;}
function prepareBGR({rgb,width,height,nativeAffineFloat32}={},side){
 const inv=inverseAffine86(nativeAffineFloat32);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||!(rgb instanceof Uint8Array)||rgb.length!==width*height*3)throw new Error('原属性0/34 RGB照片像素或尺寸无效');
 const area=side*side,out=new Float32Array(area*3);
 //143b354f0: source RGB301→target FLOAT BGR300. Scalar callback1446d03a0.
 for(let y=0;y<side;y++){
  let sx=y*inv[1]+inv[2],sy=y*inv[4]+inv[5];
  for(let x=0;x<side;x++){
   const ix=Math.floor(sx),iy=Math.floor(sy),pixel=y*side+x;
   const valid=ix>=0&&iy>=0&&ix<width-1&&iy<height-1;
   let tl=0,bl=0,tr=0,br=0,wBR=0,wBL=0,wTL=0,wTR=0;
   if(valid){
    const fx=f32(sx-ix),fy=f32(sy-iy),ox=f32(1-fx),oy=f32(1-fy);
    wBR=f32(fx*fy);wBL=f32(ox*fy);wTL=f32(ox*oy);wTR=f32(oy*fx);
    tl=(iy*width+ix)*3;tr=tl+3;bl=tl+width*3;br=bl+3;
   }
   for(let c=0;c<3;c++){
    let sample=0;const sourceChannel=2-c;
    if(valid){
     // 原callback先TL+TR，再BL，最后BR；保留各步F32舍入。
     sample=f32(f32(rgb[tl+sourceChannel]*wTL)+f32(rgb[tr+sourceChannel]*wTR));
     sample=f32(sample+f32(rgb[bl+sourceChannel]*wBL));
     sample=f32(sample+f32(rgb[br+sourceChannel]*wBR));
    }
    out[c*area+pixel]=f32(sample*SCALE);
   }
   sx+=inv[0];sy+=inv[3];
  }
 }
 return out;
}
function prepareAttribute0Input(source){return prepareBGR(source,256);}
function prepareAttribute34Input(source){return prepareBGR(source,146);}
function attribute0FromRaw(raw){
 //1470a8650: original graph already rounds; native conversion truncates only.
 const value=f32(raw);
 const integer=!Number.isFinite(value)||value<-2147483648||value>=2147483648?-2147483648:Math.trunc(value);
 return {0:Math.max(0,Math.min(80,integer))};
}
function attribute34FromRaw(raw){
 if(!raw||raw.length!==2||!Array.from(raw).every(Number.isFinite))throw new Error('原属性34必须提供两项有限输出');
 return {3:f32(raw[1]),4:f32(raw[0])};
}
function checkInput(input,c){
 if(!(input instanceof Float32Array)||input.length!==3*c.side*c.side||!input.every(Number.isFinite))throw new Error('原属性0/34模型输入float32尺寸无效');
}
function checkManifest(m){
 for(const [role,c] of Object.entries(CONTRACTS)){
  const r=m.models?.[role];
  if(!r||r.resourceId!==c.resourceId||r.registeredModelId!==c.registeredModelId||r.file!==c.file||r.sha256!==c.sha256||r.input?.name!==c.inputName||r.output?.name!==c.outputName||JSON.stringify(r.input.shape)!==JSON.stringify([1,3,c.side,c.side])||JSON.stringify(r.output.shape)!==JSON.stringify(c.outputShape))throw new Error('原属性0/34 manifest合同无效');
 }
 return m;
}
class NativeAttribute034{
 constructor({directory=path.join(__dirname,'assets','native-attributes')}={}){
  this.directory=directory;this.closed=false;this.activeRuns=new Set();this.sessions=new Map();
 }
 async configuration(){
  if(!this.configPromise)this.configPromise=fs.readFile(path.join(this.directory,'manifest-034.json'),'utf8').then(text=>checkManifest(JSON.parse(text)));
  return this.configPromise;
 }
 session(role){
  if(this.closed)return Promise.reject(new Error('原属性0/34模型后端已关闭'));
  const c=contract(role);
  if(!this.sessions.has(role)){
   const pending=(async()=>{
    await this.configuration();
    if(this.closed)throw new Error('原属性0/34模型后端已关闭');
    const bytes=await fs.readFile(path.join(this.directory,c.file));
    if(createHash('sha256').update(bytes).digest('hex')!==c.sha256)throw new Error('原属性0/34模型 SHA 校验失败');
    if(this.closed)throw new Error('原属性0/34模型后端已关闭');
    return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,logSeverityLevel:3});
   })();
   this.sessions.set(role,pending);
   pending.catch(()=>{if(this.sessions.get(role)===pending)this.sessions.delete(role);});
  }
  return this.sessions.get(role);
 }
 async run(role,input){
  if(this.closed)throw new Error('原属性0/34模型后端已关闭');
  const c=contract(role);checkInput(input,c);
  let finish;const active=new Promise(resolve=>{finish=resolve;});this.activeRuns.add(active);
  try{
   const session=await this.session(role);
   const result=await session.run({[c.inputName]:new ort.Tensor('float32',input,[1,3,c.side,c.side])}),out=result[c.outputName];
   if(!out||out.type!=='float32'||out.dims.length!==c.outputShape.length||!out.dims.every((v,i)=>v===c.outputShape[i])||out.data.length!==c.outputShape.reduce((a,b)=>a*b,1)||!out.data.every(Number.isFinite))throw new Error('原属性0/34模型输出合同无效');
   return role==='attribute0'?attribute0FromRaw(out.data[0]):attribute34FromRaw(out.data);
  }finally{this.activeRuns.delete(active);finish();}
 }
 async runAttribute0(input){return this.run('attribute0',input);}
 async runAttribute34(input){return this.run('attribute34',input);}
 async inferAttribute0(source){return this.runAttribute0(prepareAttribute0Input(source));}
 async inferAttribute34(source){return this.runAttribute34(prepareAttribute34Input(source));}
 async close(){
  this.closed=true;
  if(!this.closePromise)this.closePromise=(async()=>{
   await Promise.all(this.activeRuns);
   const sessions=await Promise.allSettled(this.sessions.values());this.sessions.clear();
   await Promise.all(sessions.filter(s=>s.status==='fulfilled').map(s=>s.value.release()));
  })();
  return this.closePromise;
 }
}
module.exports={prepareAttribute0Input,prepareAttribute34Input,attribute0FromRaw,attribute34FromRaw,NativeAttribute034,CONTRACTS};
