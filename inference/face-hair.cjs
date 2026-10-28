const {createNativeTeethCache}=require('./native-teeth-v3-cache.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const ort=require('onnxruntime-node');
const sharp=require('sharp');
const {prepareNativeV2Input,projectNativeV2Mask}=require('./native-face-parsing-v2.cjs');
const {OriginalFaceLandmarks}=require('./face-landmarks.cjs');
const {initializeOpenCV}=require('./opencv-runtime.cjs');

const MODEL_SHA256='bcc69d6266a7e7857c0f4ba11fd78191ede3b2948644004a39a5ec515c6e7a76';
const SIDE=384,MAX_PIXELS=80000000;
// 原生 V2 的原始平面序号；只开放已经核验并回放的分区。
const REGIONS=Object.freeze({hair:{channel:1,name:'头发'},eyebrows:{channel:3,name:'眉毛'},lips:{channel:8,name:'嘴唇'},teeth:{channel:10,name:'牙齿'}});
const f=Math.fround;

function validateBox(box){
 const epsilon=4*Number.EPSILON;
 if(!box||typeof box!=='object'||![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.x<0||box.y<0||box.x>=1||box.y>=1||box.width<=0||box.height<=0||box.x+box.width>1+epsilon||box.y+box.height>1+epsilon)
  throw new Error('人脸框无效，请在照片内框选完整脸部');
 // 起点和宽高分别归一化可能超过1几个浮点单位；只夹回这类舍入误差。
 return {...box,width:Math.min(box.width,1-box.x),height:Math.min(box.height,1-box.y)};
}
function faceSquare(box,width,height){
 const side=Math.max(box.width*width,box.height*height)/.6;
 return {left:(box.x+box.width/2)*width-side/2,top:(box.y+box.height/2)*height-side/2,side};
}

// V2 原生 RGB、ImageNet 均值/缩放、整数目标坐标与完整 2×2 支撑。
// 越界像素先置 RGB 零，再执行均值归一化；此处不旋转人脸。
const MEAN=[123.675003,116.279999,103.529999].map(f);
const SCALE=[.017124753445,.017507003620,.017429193482].map(f);
function sampleRgbInput(rgb,width,height,square,side=SIDE){
 const result=new Float32Array(3*side*side),step=square.side/side;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const sx=square.left+x*step,sy=square.top+y*step,ix=Math.floor(sx),iy=Math.floor(sy);
  const valid=ix>=0&&iy>=0&&ix<width-1&&iy<height-1;
  const dx=f(sx-ix),dy=f(sy-iy),nx=f(1-dx),ny=f(1-dy),at=(iy*width+ix)*3;
  const weights=[f(nx*ny),f(dx*ny),f(nx*dy),f(dx*dy)]; // 原callback先舍入权重，再乘像素。
  for(let c=0;c<3;c++){
   let value=0;
   if(valid){
    const a=f(rgb[at+c]*weights[0]),b=f(rgb[at+3+c]*weights[1]);
    const d=f(rgb[at+width*3+c]*weights[2]),e=f(rgb[at+width*3+3+c]*weights[3]);
    value=f(f(f(a+b)+d)+e);
   }
   result[c*side*side+y*side+x]=f(f(value-MEAN[c])*SCALE[c]);
  }
 }
 return result;
}

function probabilityBytes(values){
 const bytes=Buffer.alloc(values.length);
 for(let i=0;i<values.length;i++){
  const value=values[i];if(!Number.isFinite(value)||value<-.00001||value>1.00001)throw new Error('人像分区模型输出无效');
  bytes[i]=Math.trunc(f(Math.max(0,Math.min(1,value))*255));
 }
 return bytes;
}

// 将裁脸坐标中的软蒙版逆映射到预览。预览插值为独立实现，未声称原生一致。
function projectMask(mask,side,square,sourceWidth,sourceHeight,width,height){
 const alpha=Buffer.alloc(width*height),scale=side/square.side;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=(x*sourceWidth/width-square.left)*scale,sy=(y*sourceHeight/height-square.top)*scale;
  if(sx<0||sy<0||sx>=side||sy>=side)continue;
  const ix=Math.floor(sx),iy=Math.floor(sy),jx=Math.min(side-1,ix+1),jy=Math.min(side-1,iy+1),dx=sx-ix,dy=sy-iy;
  const v=mask[iy*side+ix]*(1-dx)*(1-dy)+mask[iy*side+jx]*dx*(1-dy)+mask[jy*side+ix]*(1-dx)*dy+mask[jy*side+jx]*dx*dy;
  alpha[y*width+x]=Math.trunc(v);
 }
 return alpha;
}

class FaceHair{
 constructor(assets=path.join(__dirname,'assets')){this.assets=assets;this.running=false;this.sessionPromise=null;this.landmarks=new OriginalFaceLandmarks();this.closed=false;this.activeJob=null;}
 async session(){
  if(this.closed)throw new Error('人像分区后端已关闭');
  return this._sessionForActiveJob();
 }
 // 已接收的任务可在close等待期间完成；新任务由公开入口的closed检查阻止。
 async _sessionForActiveJob(){
  if(!this.sessionPromise)this.sessionPromise=(async()=>{
   const bytes=await fs.readFile(path.join(this.assets,'models','face-hair.onnx'));
   if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw new Error('人像分区原模型校验失败，请重新解压软件');
   return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,graphOptimizationLevel:'all'});
  })().catch(error=>{this.sessionPromise=null;throw error;});
  return this.sessionPromise;
 }
 async segment(bytes,box,width,height,region='hair'){
  if(this.closed)throw new Error('人像分区后端已关闭');
  if(!Object.hasOwn(REGIONS,region))throw new Error('不支持的人像分区');
  const {channel,name}=REGIONS[region];
  box=validateBox(box);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1600||height>1600)throw new Error('蒙版尺寸无效，最长边不能超过 1600 像素');
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('照片内容无效');
  if(this.running)throw new Error('人像分区模型正在处理，请稍候');
  this.running=true;const start=performance.now();let finish;
  this.activeJob=new Promise(resolve=>{finish=resolve;});
  try{
   let decoded;
   try{decoded=await sharp(Buffer.from(bytes),{limitInputPixels:MAX_PIXELS,failOn:'error'}).rotate().toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});}
   catch(error){throw new Error('无法读取照片，请使用不超过 8000 万像素的有效图片',{cause:error});}
   const {data,info}=decoded;
   if(info.width*info.height>MAX_PIXELS||info.channels!==3)throw new Error('照片尺寸或颜色格式无效');
   const face=await this.landmarks.inferFace(data,info.width,info.height,box);
   const prepared=prepareNativeV2Input({rgb:data,width:info.width,height:info.height,points142:face.points142,angle:face.faceAngleRadiansCandidate});
   const session=await this._sessionForActiveJob(),outputs=await session.run({'11':new ort.Tensor('float32',prepared.input,[1,3,SIDE,SIDE])});
   const output=outputs['81'];
   if(!output||output.dims.length!==4||!output.dims.every((n,i)=>n===[1,17,SIDE,SIDE][i])||output.data.length!==17*SIDE*SIDE)throw new Error('人像分区模型输出尺寸无效');
   if(!output.data.every(Number.isFinite))throw new Error('人像分区模型输出包含无效数值');
   const plane=probabilityBytes(output.data.subarray(channel*SIDE*SIDE,(channel+1)*SIDE*SIDE));
   await initializeOpenCV();
   const alpha=projectNativeV2Mask({plane,inverse:prepared.geometry.savedInverse,sourceWidth:info.width,sourceHeight:info.height,width,height}),rgba=Buffer.alloc(width*height*4,255);
   let foreground=0;for(let i=0;i<alpha.length;i++){rgba[i*4+3]=alpha[i];if(alpha[i]>127)foreground++;}
   const png=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
   const nativeTeethFace=region==='teeth'?createNativeTeethCache({plane9:probabilityBytes(output.data.subarray(9*SIDE*SIDE,10*SIDE*SIDE)),plane10:plane,inverse:prepared.geometry.savedInverse,sourceWH:[info.width,info.height]}):undefined;
   return {nativeTeethFace,mask:png.toString('base64'),width,height,seconds:(performance.now()-start)/1000,foregroundFraction:foreground/alpha.length,model:`原模型试验 · ${name}选区`,channel,region,backend:'original-face-parsing-v2',experimental:true,cropPolicy:'original-v2-first142',limitations:[region==='hair'?'帽子与逆光区域可能误选':'逆光、小脸与遮挡可能误选','检测框、九角搜索与角度函数仍为独立实现','尚未完成原软件逐像素一致性验证']};
  }finally{this.running=false;finish();this.activeJob=null;}
 }
 // 当前任务结束后释放自己持有的关键点与V2会话；关闭可重复调用。
 close(){
  this.closed=true;
  if(!this.closePromise)this.closePromise=(async()=>{
   if(this.activeJob)await this.activeJob;
   const errors=[];
   try{await this.landmarks.close();}catch(error){errors.push(error);}
   const settled=await Promise.allSettled(this.sessionPromise?[this.sessionPromise]:[]);
   this.sessionPromise=null;
   for(const result of settled)if(result.status==='fulfilled')try{await result.value.release();}catch(error){errors.push(error);}
   if(errors.length===1)throw errors[0];
   if(errors.length>1)throw new AggregateError(errors,'人像分区模型释放失败');
  })();
  return this.closePromise;
 }
}
module.exports={FaceHair,sampleRgbInput,probabilityBytes,projectMask,faceSquare,prepareNativeV2Input,projectNativeV2Mask};
