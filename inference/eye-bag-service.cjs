'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),sharp=require('sharp');
const {OriginalFaceLandmarks}=require('./face-landmarks.cjs'),{EyeBagModels}=require('./eye-bag-models.cjs'),{EyeBagParsing}=require('./eye-bag-parsing.cjs');
const {prepareEyeBagGeometry}=require('./eye-bag-geometry.cjs'),{nativeSimilarity}=require('./native-fit.cjs'),{prepareEyeBagProtection}=require('./eye-bag/protection/prepare-eye-bag-protection.cjs'),core=require('./eye-bag/core.cjs'),{fromUI,handlerControls}=require('./eye-bag-strength.cjs');
async function decodePhoto(bytes){
 const {data,info}=await sharp(Buffer.from(bytes),{limitInputPixels:80000000,failOn:'error'}).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),area=info.width*info.height;
 if(info.channels!==4)throw Error('去眼袋照片颜色格式无效');
 const rgb=new Uint8Array(area*3),alpha=new Uint8Array(area);
 for(let i=0;i<area;i++){rgb[i*3]=data[i*4];rgb[i*3+1]=data[i*4+1];rgb[i*3+2]=data[i*4+2];alpha[i]=data[i*4+3];}
 return {rgb,alpha,width:info.width,height:info.height};
}
async function encodePhoto({rgb,alpha,width,height}){
 const rgba=Buffer.allocUnsafe(width*height*4);for(let i=0;i<alpha.length;i++){rgba[i*4]=rgb[i*3];rgba[i*4+1]=rgb[i*3+1];rgba[i*4+2]=rgb[i*3+2];rgba[i*4+3]=alpha[i];}
 return sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
}
class EyeBagService{
 constructor({landmarks=new OriginalFaceLandmarks(),models=new EyeBagModels(),parsing=new EyeBagParsing(),decode=decodePhoto,encode=encodePhoto,geometry=prepareEyeBagGeometry,protection=prepareEyeBagProtection,runFace=core.runFace}={}){Object.assign(this,{landmarks,models,parsing,decode,encode,geometry,protection,runFace});this.running=false;this.closed=false;}
 async template(){
  if(!this.templatePromise)this.templatePromise=(async()=>{const bytes=await fs.readFile(path.join(__dirname,'assets/eye-bag/template194.f32'));if(createHash('sha256').update(bytes).digest('hex')!=='1e1bca8e8b7c760e81ed76da4dec51173e0d43b3b264c4e79d21ddb02587919f')throw Error('去眼袋原模板校验失败，请重新解压软件');return new Float32Array(Uint8Array.from(bytes).buffer);})().catch(e=>{this.templatePromise=null;throw e;});return this.templatePromise;
 }
 async repair(bytes,options){
  if(this.closed)throw Error('去眼袋后端已关闭');if(this.running)throw Error('正在处理去眼袋，请稍候');
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('照片内容无效');
  const controls=handlerControls(fromUI(options||{}));if(!controls.primaryEnabled)throw Error('请先增加去眼袋强度');
  this.running=true;let finish;this.activeJob=new Promise(r=>finish=r);const start=performance.now();
  try{
   const decoded=await this.decode(bytes),{rgb,alpha,width,height}=decoded;
   if(![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||width*height>80000000||!(rgb instanceof Uint8Array)||rgb.length!==width*height*3||!(alpha instanceof Uint8Array)||alpha.length!==width*height)throw Error('去眼袋需要有效照片，单边2至32766像素，总像素不超过8000万');
   const detected=await this.landmarks.detect(bytes,{maxFaces:8,quality:true});
   if(detected.width!==width||detected.height!==height||!Array.isArray(detected.faces)||detected.faces.length>8)throw Error('去眼袋人脸数据或照片尺寸无效');
   let mutable=rgb.slice();const faces=[],template194=detected.faces.length?await this.template():null;
   // Explicit product scheduling: detect on the original photo; prepare each
   // face's V2 protection from that same original RGB; repair current RGB serially.
   // Original whole request/caching scheduler remains a documented boundary.
   for(const face of detected.faces){
    const geometry=this.geometry({source194:Float32Array.from(face.points194.flat()),sourceWH:[width,height],template194,nativeSimilarity});
    if(geometry.ROI[2]>4096||geometry.ROI[3]>4096)throw Error('当前人脸区域单边限4096像素，请缩小照片后重试');
    const parsing=await this.parsing.prepare({rgb,width,height,points142:face.points142,angle:face.faceAngleRadiansCandidate});
    const protection=this.protection({...parsing,fullsourceWH:[width,height],sourceROI:Array.from(geometry.ROI),roiForward:geometry.roiForward,aligned194:geometry.aligned194});
    const result=await this.runFace({source:mutable,width,height,geometry,quality:face.quality142,cache1c8:protection.cache1c8,cache228:protection.cache228,...controls,runtimeFlags:[false,false]},(part,input)=>this.models.run(part,input));
    mutable=result.output;
    for(let i=0;i<alpha.length;i++)if(alpha[i]===0){mutable[i*3]=rgb[i*3];mutable[i*3+1]=rgb[i*3+1];mutable[i*3+2]=rgb[i*3+2];}
    faces.push({ROI:Array.from(geometry.ROI),rois:result.rois,crops:result.crops,modelOrder:result.modelOrder});
   }
   const png=faces.length?await this.encode({rgb:mutable,alpha,width,height}):Buffer.alloc(0);
   return {png,width,height,processedFaces:faces.length,detectedFaces:detected.detectedFaces,faces,seconds:(performance.now()-start)/1000,nativeApplicationParity:false};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const results=await Promise.allSettled([this.landmarks.close(),this.models.close(),this.parsing.close()]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;})();return this.closePromise;}
}
module.exports={EyeBagService,decodePhoto,encodePhoto};
