'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {OriginalFaceLandmarks}=require('./face-landmarks.cjs'),{LipWrinkleModels}=require('./lip-wrinkle-models.cjs'),{LipWrinkleParsing}=require('./lip-wrinkle-parsing.cjs'),{decodePhoto,encodePhoto}=require('./eye-bag-service.cjs'),geometryModule=require('./lip-wrinkle/geometry.cjs'),core=require('./lip-wrinkle/core.cjs');
async function originalTemplate(){const b=await fs.readFile(path.join(__dirname,'assets/lip-wrinkle/template142.f32'));if(createHash('sha256').update(b).digest('hex')!=='32d9e76c7e3d888f082fd1d3837f129d0c970fb605462149c2aac8098166f890')throw Error('唇纹原模板校验失败，请重新解压软件');return new Float32Array(Uint8Array.from(b).buffer);}
function strengthFromPercent(value){const strength=Math.fround(value/100);if(typeof value!=='number'||!Number.isFinite(value)||value>100||!(strength>.005))throw Error('请把唇纹强度设置为1至100');return strength;}
class LipWrinkleService{
 constructor({landmarks=new OriginalFaceLandmarks(),models=new LipWrinkleModels(),parsing=new LipWrinkleParsing(),decode=decodePhoto,encode=encodePhoto,template=originalTemplate,geometry=geometryModule.prepare,runFace=core.runFace}={}){Object.assign(this,{landmarks,models,parsing,decode,encode,template,geometry,runFace});this.closed=false;this.running=false;}
 async repair(bytes,options={}){
  if(this.closed)throw Error('唇纹后端已关闭');if(this.running)throw Error('唇纹正在处理，请稍候');
  const strength=strengthFromPercent(options.strengthPercent);if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('照片内容无效');
  this.running=true;let finish;this.activeJob=new Promise(r=>finish=r);const start=performance.now();
  try{
   const {rgb,alpha,width,height}=await this.decode(bytes);
   if(![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||width*height>80000000||!(rgb instanceof Uint8Array)||rgb.length!==width*height*3||!(alpha instanceof Uint8Array)||alpha.length!==width*height)throw Error('唇纹需要有效照片，单边2至32766像素，总像素不超过8000万');
   const detected=await this.landmarks.detect(bytes,{maxFaces:8});if(detected.width!==width||detected.height!==height||!Array.isArray(detected.faces)||detected.faces.length>8)throw Error('唇纹人脸数据或照片尺寸无效');
   const target142=detected.faces.length?await this.template():null;let mutable=rgb.slice();const faces=[];
   // Own scheduling: detect/parse original RGB, update current RGB face by face.
   for(const face of detected.faces){
    const geometry=this.geometry({source194:Float32Array.from(face.points194.flat()),sourceWH:[width,height],target142});
    if(geometry.ROI[2]>4096||geometry.ROI[3]>4096)throw Error('当前人脸区域单边限4096像素，请缩小照片后重试');
    const parsing=await this.parsing.prepare({rgb,width,height,points142:face.points142,angle:face.faceAngleRadiansCandidate});
    const before=mutable;
    const result=await this.runFace({source:mutable,width,height,geometry,...parsing,savedParsingWH:[width,height],strength},input=>this.models.run(input));
    if(!result.processed)continue;mutable=result.output;
    for(let i=0;i<alpha.length;i++)if(alpha[i]===0){mutable[i*3]=rgb[i*3];mutable[i*3+1]=rgb[i*3+1];mutable[i*3+2]=rgb[i*3+2];}
    let changedRGBFields=0;const [x,y,w,h]=geometry.ROI;for(let row=y;row<y+h;row++)for(let i=(row*width+x)*3,end=i+w*3;i<end;i++)if(mutable[i]!==before[i])changedRGBFields++;
    faces.push({ROI:Array.from(geometry.ROI),modelWH:geometry.modelWH,crop:result.crop,changedRGBFields});
   }
   let changedRGBFields=0;for(let i=0;i<rgb.length;i++)if(mutable[i]!==rgb[i])changedRGBFields++;
   const png=faces.length?await this.encode({rgb:mutable,alpha,width,height}):Buffer.alloc(0);return {png,width,height,processedFaces:faces.length,detectedFaces:detected.detectedFaces,faces,changedRGBFields,seconds:(performance.now()-start)/1000,nativeApplicationParity:false};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const r=await Promise.allSettled([this.landmarks.close(),this.models.close(),this.parsing.close()]);const fail=r.find(x=>x.status==='rejected');if(fail)throw fail.reason;})();return this.closePromise;}
}
module.exports={LipWrinkleService,strengthFromPercent};
