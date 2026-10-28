const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const ort=require('onnxruntime-node');
const sharp=require('sharp');

const MODEL_SHA256='f7e9c8a323098e12cf1a166ea0d1ff18c1273e2557fc3446b739049e596a8527';
const SIDE=256,MAX_PIXELS=80000000;
const f=Math.fround;

function validateBox(box){
 const epsilon=4*Number.EPSILON;
 if(!box||typeof box!=='object'||![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.x<0||box.y<0||box.x>=1||box.y>=1||box.width<=0||box.height<=0||box.x+box.width>1+epsilon||box.y+box.height>1+epsilon)
  throw new Error('人脸框无效，请在照片内框选完整脸部');
 // 起点和宽高分别归一化可能超过1几个浮点单位；只夹回这类舍入误差。
 return {...box,width:Math.min(box.width,1-box.x),height:Math.min(box.height,1-box.y)};
}
function faceSquare(box,width,height){
 const side=Math.max(box.width*width,box.height*height)/.8;
 return {left:(box.x+box.width/2)*width-side/2,top:(box.y+box.height/2)*height-side/2,side};
}

// 原生 scalar callback 的整数目标坐标、完整 2×2 支撑与浮点插值。
// BGR 是当前试验候选；原格式枚举及整条原生数值一致性尚未确认。
function sampleBgrInput(rgb,width,height,square,side=SIDE){
 const result=new Float32Array(3*side*side),scale=f(1/255),step=square.side/side;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const sx=square.left+x*step,sy=square.top+y*step,ix=Math.floor(sx),iy=Math.floor(sy);
  if(ix<0||iy<0||ix>=width-1||iy>=height-1)continue;
  const dx=f(sx-ix),dy=f(sy-iy),nx=f(1-dx),ny=f(1-dy),at=(iy*width+ix)*3;
  for(let c=0;c<3;c++){
   const sc=2-c;
   const a=f(f(rgb[at+sc]*nx)*ny),b=f(f(rgb[at+3+sc]*dx)*ny);
   const d=f(f(rgb[at+width*3+sc]*nx)*dy),e=f(f(rgb[at+width*3+3+sc]*dx)*dy);
   result[c*side*side+y*side+x]=f(f(f(f(a+b)+d)+e)*scale);
  }
 }
 return result;
}

function probabilityBytes(values){
 const bytes=Buffer.alloc(values.length);
 for(let i=0;i<values.length;i++){
  const value=values[i];if(!Number.isFinite(value)||value<-.00001||value>1.00001)throw new Error('皮肤模型输出无效');
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

class FaceSkin{
 constructor(assets=path.join(__dirname,'assets')){this.assets=assets;this.running=false;this.sessionPromise=null;}
 async session(){
  if(!this.sessionPromise)this.sessionPromise=(async()=>{
   const bytes=await fs.readFile(path.join(this.assets,'models','face-skin.onnx'));
   if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw new Error('皮肤原模型校验失败，请重新解压软件');
   return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,graphOptimizationLevel:'all'});
  })().catch(error=>{this.sessionPromise=null;throw error;});
  return this.sessionPromise;
 }
 async segment(bytes,box,width,height){
  box=validateBox(box);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1600||height>1600)throw new Error('蒙版尺寸无效，最长边不能超过 1600 像素');
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('照片内容无效');
  if(this.running)throw new Error('皮肤模型正在处理，请稍候');
  this.running=true;const start=performance.now();
  try{
   let decoded;
   try{decoded=await sharp(Buffer.from(bytes),{limitInputPixels:MAX_PIXELS,failOn:'error'}).rotate().toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});}
   catch(error){throw new Error('无法读取照片，请使用不超过 8000 万像素的有效图片',{cause:error});}
   const {data,info}=decoded;
   if(info.width*info.height>MAX_PIXELS||info.channels!==3)throw new Error('照片尺寸或颜色格式无效');
   const square=faceSquare(box,info.width,info.height),input=sampleBgrInput(data,info.width,info.height,square);
   const session=await this.session(),outputs=await session.run({'12':new ort.Tensor('float32',input,[1,3,SIDE,SIDE])});
   const output=outputs['39'];
   if(!output||output.dims.length!==4||!output.dims.every((n,i)=>n===[1,7,SIDE,SIDE][i])||output.data.length!==7*SIDE*SIDE)throw new Error('皮肤模型输出尺寸无效');
   const skin=probabilityBytes(output.data.subarray(SIDE*SIDE,2*SIDE*SIDE));
   const alpha=projectMask(skin,SIDE,square,info.width,info.height,width,height),rgba=Buffer.alloc(width*height*4,255);
   let foreground=0;for(let i=0;i<alpha.length;i++){rgba[i*4+3]=alpha[i];if(alpha[i]>127)foreground++;}
   const png=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
   return {mask:png.toString('base64'),width,height,seconds:(performance.now()-start)/1000,foregroundFraction:foreground/alpha.length,model:'原模型试验 · 框脸皮肤选区'};
  }finally{this.running=false;}
 }
}
module.exports={FaceSkin,sampleBgrInput,probabilityBytes,projectMask};
