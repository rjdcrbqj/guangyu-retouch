const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const sharp=require('sharp');
const MAX_PACKAGE=6*1024*1024,BYTES=4194304,hash=b=>createHash('sha256').update(b).digest('hex');
function validate(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>MAX_PACKAGE)throw new Error('特征包过大或格式无效（最多6MB）');
 let p;try{p=JSON.parse(text);}catch{throw new Error('特征包不是有效JSON');}
 if(!p||p.format!=='guangyu-native-feature'||p.version!==1||p.modelFamily!=='pixcake-segment-10.0.5'||p.dtype!=='float32le'||JSON.stringify(p.shape)!=='[1,256,64,64]')throw new Error('特征包格式、模型版本或形状不支持');
 const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 if(!hex(p.photoSha256)||!hex(p.embeddingSha256)||p.orientation!==1)throw new Error('照片指纹或方向无效；当前仅支持方向1');
 const q=p.provenance;if(!q||q.kind!=='original-runtime-readonly'||!hex(q.sourceBinarySha256)||typeof q.capturedAt!=='string'||q.capturedAt.length>40||!Number.isFinite(Date.parse(q.capturedAt)))throw new Error('缺少有效的原软件来源声明');
 for(const k of ['photoWidth','photoHeight','analysisWidth','analysisHeight','resizedWidth','resizedHeight'])if(!Number.isInteger(p[k])||p[k]<=0||p[k]>80000000)throw new Error('特征尺寸无效');
 if(p.photoWidth*p.photoHeight>80000000||p.analysisWidth*p.analysisHeight>80000000)throw new Error('照片或分析尺寸过大');
 const scale=Math.max(p.analysisWidth,p.analysisHeight)/Math.max(p.photoWidth,p.photoHeight);
 if(Math.abs(p.analysisWidth-p.photoWidth*scale)>1||Math.abs(p.analysisHeight-p.photoHeight*scale)>1)throw new Error('分析尺寸与照片比例不匹配');
 const resize=1024/Math.max(p.analysisWidth,p.analysisHeight);
 if(Math.max(p.resizedWidth,p.resizedHeight)!==1024||Math.abs(p.resizedWidth-Math.round(p.analysisWidth*resize))>1||Math.abs(p.resizedHeight-Math.round(p.analysisHeight*resize))>1)throw new Error('模型缩放尺寸不匹配');
 const photoScale=1024/Math.max(p.photoWidth,p.photoHeight);
 if(Math.abs(p.resizedWidth-p.photoWidth*photoScale)>1||Math.abs(p.resizedHeight-p.photoHeight*photoScale)>1)throw new Error('模型尺寸与原图比例不匹配');
 if(typeof p.embeddingBase64!=='string'||p.embeddingBase64.length!==Math.ceil(BYTES/3)*4||! /^[A-Za-z0-9+/]+={0,2}$/.test(p.embeddingBase64))throw new Error('特征文件长度或编码无效');
 const buffer=Buffer.from(p.embeddingBase64,'base64');if(buffer.length!==BYTES||hash(buffer)!==p.embeddingSha256)throw new Error('特征文件校验失败');
 for(let i=0;i<buffer.length;i+=4)if(!Number.isFinite(buffer.readFloatLE(i)))throw new Error('原图特征含无效数值');
 return {p,buffer};
}
class FeatureStore{
 constructor(directory){this.directory=directory;}
 async read(photoBytes){
  if(!this.directory)return null;const sha=hash(photoBytes),file=path.join(this.directory,sha+'.gyfeature');let text;
  try{if((await fs.stat(file)).size>MAX_PACKAGE)throw new Error('缓存特征包过大');text=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}
  const value=validate(text);await this.match(photoBytes,value.p);return this.entry(value);
 }
 async match(bytes,p){
  if(hash(bytes)!==p.photoSha256)throw new Error('特征包与当前照片不匹配');const m=await sharp(bytes).metadata();
  if(m.width!==p.photoWidth||m.height!==p.photoHeight||(m.orientation??1)!==p.orientation)throw new Error('特征包与照片实际尺寸或方向不匹配');
 }
 entry({p,buffer}){return {photoId:'导入特征',sha256:p.photoSha256,originalWidth:p.photoWidth,originalHeight:p.photoHeight,resizedWidth:p.resizedWidth,resizedHeight:p.resizedHeight,embeddingSha256:p.embeddingSha256,embeddingBuffer:buffer};}
 async import(bytes,text){
  if(!this.directory)throw new Error('当前环境未配置特征存储');const value=validate(text);await this.match(bytes,value.p);await fs.mkdir(this.directory,{recursive:true});
  const target=path.join(this.directory,value.p.photoSha256+'.gyfeature'),temp=target+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,JSON.stringify(value.p),{flag:'wx'});await fs.rename(temp,target);}finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  return this.entry(value);
 }
}
module.exports={FeatureStore,MAX_PACKAGE};
