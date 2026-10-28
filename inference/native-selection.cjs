const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const ort=require('onnxruntime-node');
const sharp=require('sharp');
const {FeatureStore}=require('./feature-store.cjs');
const MODEL_HASHES={'encoder.onnx':'ffe897ae4ba383d55da4fe4a76681457fb6672dd838af4cdee3f912e792c3bcb','decoder.onnx':'9bc7a7cc81d1e3638dea9138299d39ac37755896359abed04c14fe0e837a7c85'};

// 与独立验证脚本一致的像素中心和三角滤波；降采样扩大支撑域。
function resizeLinear(data,sw,sh,dw,dh,channels=1){
 const coefficients=(src,dst)=>Array.from({length:dst},(_,i)=>{
  const scale=src/dst,filter=Math.max(1,scale),center=(i+.5)*scale;
  const start=Math.max(0,Math.floor(center-filter+.5)),end=Math.min(src,Math.floor(center+filter+.5));
  const weights=[];let sum=0;for(let j=start;j<end;j++){const weight=Math.max(0,1-Math.abs((j-center+.5)/filter));weights.push(weight);sum+=weight;}
  return {start,weights:weights.map(x=>x/sum)};
 });
 const xs=coefficients(sw,dw),ys=coefficients(sh,dh),temp=Buffer.alloc(dw*sh*channels),out=Buffer.alloc(dw*dh*channels);
 for(let y=0;y<sh;y++)for(let x=0;x<dw;x++)for(let c=0;c<channels;c++){
  const {start,weights}=xs[x];let sum=0;for(let j=0;j<weights.length;j++)sum+=data[(y*sw+start+j)*channels+c]*weights[j];temp[(y*dw+x)*channels+c]=Math.floor(sum+.5);
 }
 for(let y=0;y<dh;y++)for(let x=0;x<dw;x++)for(let c=0;c<channels;c++){
  const {start,weights}=ys[y];let sum=0;for(let j=0;j<weights.length;j++)sum+=temp[((start+j)*dw+x)*channels+c]*weights[j];out[(y*dw+x)*channels+c]=Math.floor(sum+.5);
 }return out;
}

// 仅接受与已捕获原特征逐字节匹配的照片；不猜测新照片的特征。
class NativeSelection {
 constructor(assets=path.join(__dirname,'assets'),featureDirectory){this.assets=assets;this.cached=null;this.running=false;this.closed=false;this.activeJobs=new Set();this.store=new FeatureStore(featureDirectory);}
 async entry(bytes){const sha256=createHash('sha256').update(bytes).digest('hex');return (await this.manifest()).features.find(f=>f.sha256===sha256)??await this.store.read(bytes);}
 async importFeature(bytes,text){if(this.running)throw new Error('模型正在处理，请稍候');await this.store.import(bytes,text);this.cached=null;return this.inspect(bytes);}
 async manifest(){return this.manifestData??=JSON.parse(await fs.readFile(path.join(this.assets,'manifest.json'),'utf8'));}
 async inspect(bytes){
  const hash=createHash('sha256').update(bytes).digest('hex');
  const entry=await this.entry(bytes);
  return {available:Boolean(entry),sha256:hash,photoId:entry?.photoId,reason:entry?(entry.embeddingBuffer?'已匹配导入的原生特征 · 可离线点击试验':'已匹配原软件真实特征 · 可离线点击试验'):'这张照片没有匹配的原模型特征缓存，可导入原生特征包。'};
 }
 async sessions(){
  if(this.closed)throw new Error('点选原模型后端已关闭');
  if(!this.sessionsPromise){
   const promise=(async()=>{
    const bytes=await Promise.all(Object.entries(MODEL_HASHES).map(async([name,hash])=>{const data=await fs.readFile(path.join(this.assets,'selection-corrected',name));if(createHash('sha256').update(data).digest('hex')!==hash)throw new Error('点选原模型校验失败，请重新解压试验包');return data;}));
    const results=await Promise.allSettled(bytes.map(data=>Promise.resolve().then(()=>ort.InferenceSession.create(data,{executionProviders:['cpu'],intraOpNumThreads:4,interOpNumThreads:1,graphOptimizationLevel:'all'}))));
    const failure=results.find(result=>result.status==='rejected');
    if(failure){await Promise.allSettled(results.filter(result=>result.status==='fulfilled').map(result=>result.value.release()));throw failure.reason;}
    return results.map(result=>result.value);
   })();this.sessionsPromise=promise;promise.catch(()=>{if(this.sessionsPromise===promise)this.sessionsPromise=null;});
  }
  return this.sessionsPromise;
 }
 async prepare(bytes,entry){
  if(this.cached?.sha256===entry.sha256)return this.cached;
  const [encoder]=await this.sessions();
  const w=entry.resizedWidth,h=entry.resizedHeight;
  if(!(w>0&&h>0&&w<=1024&&h<=1024))throw new Error('特征尺寸无效');
  const decoded=await sharp(bytes).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const raw=resizeLinear(decoded.data,decoded.info.width,decoded.info.height,w,h,3);
  const x=new Float32Array(3*1024*1024),mean=[123.675,116.28,103.53],scale=[.0171247534,.0175070018,.0174291953];
  for(let c=0;c<3;c++){
   const base=c*1024*1024;x.fill(Math.fround(-Math.fround(mean[c])*Math.fround(scale[c])),base,base+1024*1024);
   for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++)x[base+y*1024+xx]=Math.fround(Math.fround(raw[(y*w+xx)*3+c]-Math.fround(mean[c]))*Math.fround(scale[c]));
  }
  const buffer=entry.embeddingBuffer??await fs.readFile(path.join(this.assets,entry.embedding));
  if(buffer.length!==256*64*64*4)throw new Error('原图特征文件不完整');
  if(entry.embeddingSha256&&createHash('sha256').update(buffer).digest('hex')!==entry.embeddingSha256)throw new Error('原图特征校验失败，请重新解压试验包');
  const values=new Float32Array(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
  if(!values.every(Number.isFinite))throw new Error('原图特征含无效数值');
  const features=await encoder.run({'3070435246':new ort.Tensor('float32',x,[1,3,1024,1024])});
  this.cached={sha256:entry.sha256,features,embedding:new ort.Tensor('float32',values,[1,256,64,64])};return this.cached;
 }
 async segment(bytes,points,width,height){
  if(this.closed)throw new Error('点选原模型后端已关闭');
  let finish;const active=new Promise(resolve=>{finish=resolve;});this.activeJobs.add(active);
  try{return await this.segmentJob(bytes,points,width,height);}finally{this.activeJobs.delete(active);finish();}
 }
 async segmentJob(bytes,points,width,height){
  if(this.running)throw new Error('模型正在处理，请稍候');
  this.running=true;const start=performance.now();
  try{
   const state=await this.inspect(bytes);if(!state.available)throw new Error(state.reason);
   if(!Array.isArray(points)||points.length!==1||points[0].label!==1||points.some(p=>![p.x,p.y].every(Number.isFinite)||p.x<0||p.x>1||p.y<0||p.y>1||![0,1].includes(p.label)))throw new Error('原生自由模式每次只推理一个正点，增减在蒙版层执行');
   if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw new Error('蒙版尺寸无效');
   const entry=await this.entry(bytes);
   const prepared=await this.prepare(bytes,entry);const [,decoder]=await this.sessions();
   const n=points.length+1,coords=new Float32Array(n*2),labels=new Float32Array(n),heat=new Float32Array(4096);
   points.forEach((p,i)=>{coords[i*2]=Math.min(entry.resizedWidth-0.001,p.x*entry.resizedWidth);coords[i*2+1]=Math.min(entry.resizedHeight-0.001,p.y*entry.resizedHeight);labels[i]=p.label;
    const cx=Math.trunc(coords[i*2]/16),cy=Math.trunc(coords[i*2+1]/16);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++)heat[y*64+x]=Math.max(heat[y*64+x],Math.exp(-Math.floor(((x-cx)**2+(y-cy)**2)/882)));
   });coords[(n-1)*2]=-.5;coords[(n-1)*2+1]=-.5;labels[n-1]=-1;
   const feed={'1692':new ort.Tensor('float32',coords,[1,1,n,2]),'915':new ort.Tensor('float32',labels,[1,1,1,n]),'865':prepared.embedding,'288':new ort.Tensor('float32',heat,[1,1,64,64]),'1510':prepared.features['2795992483'],'1426':prepared.features['2795992480'],'1785':prepared.features['2795992481']};
   const result=await decoder.run(feed);const logits=result['935'];const mh=logits.dims[2],mw=logits.dims[3],gray=Buffer.alloc(mw*mh);
   for(let i=0;i<gray.length;i++){const v=logits.data[i];if(!Number.isFinite(v))throw new Error('模型输出无效');gray[i]=Math.floor(255/(1+Math.exp(-Math.max(-80,Math.min(80,v)))));}
   // 当前插值采用可核验的候选实现；保留软边缘，不二值化后冒充原生结果。
   const full=resizeLinear(gray,mw,mh,1024,1024),crop=Buffer.alloc(entry.resizedWidth*entry.resizedHeight);
   for(let y=0;y<entry.resizedHeight;y++)full.copy(crop,y*entry.resizedWidth,y*1024,y*1024+entry.resizedWidth);
   const alpha=resizeLinear(crop,entry.resizedWidth,entry.resizedHeight,width,height);
   const rgba=Buffer.alloc(width*height*4,255);let foreground=0;
   for(let i=0;i<alpha.length;i++){rgba[i*4+3]=alpha[i];if(alpha[i]>127)foreground++;}
   const png=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
   return {mask:png.toString('base64'),width,height,sha256:state.sha256,photoId:entry.photoId,points:points.length,foregroundFraction:foreground/(width*height),seconds:(performance.now()-start)/1000,model:'原模型试验 · Segment 完整解码器',selectedPlane:0,limitation:'仅匹配原软件特征缓存的照片；缩放插值仍为候选实现。'};
  }finally{this.running=false;}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await Promise.all(this.activeJobs);const pair=await Promise.allSettled(this.sessionsPromise?[this.sessionsPromise]:[]);this.sessionsPromise=null;this.cached=null;await Promise.all(pair.filter(result=>result.status==='fulfilled').flatMap(result=>result.value.map(session=>session.release())));})();return this.closePromise;}
}
module.exports={NativeSelection};
