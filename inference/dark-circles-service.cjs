'use strict';
const {OriginalFaceLandmarks}=require('./face-landmarks.cjs'),{DarkCirclesModels}=require('./dark-circles-models.cjs'),{EyeBagParsing}=require('./eye-bag-parsing.cjs');
const {decodePhoto,encodePhoto}=require('./eye-bag-service.cjs'),inputAPI=require('./dark-circles/input/index.cjs'),core=require('./dark-circles/core.cjs'),{prepareWorkingMask}=require('./dark-circles/protection/prepare-working-mask.cjs'),{fromUI,handlerControls}=require('./dark-circles-strength.cjs');
class DarkCirclesService{
 constructor({landmarks=new OriginalFaceLandmarks(),models=new DarkCirclesModels(),parsing=new EyeBagParsing(),decode=decodePhoto,encode=encodePhoto,geometry=inputAPI.prepareDarkCirclesGeometry,workingMask=prepareWorkingMask,runFace=core.runFace}={}){Object.assign(this,{landmarks,models,parsing,decode,encode,geometry,workingMask,runFace});this.running=false;this.closed=false;}
 async repair(bytes,options){
  if(this.closed)throw Error('祛黑眼圈后端已关闭');if(this.running)throw Error('正在处理祛黑眼圈，请稍候');
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('照片内容无效');
  const controls=handlerControls(fromUI(options||{}));if(!controls.enabled)throw Error('请先增加祛黑眼圈强度');
  this.running=true;let finish;this.activeJob=new Promise(r=>finish=r);const start=performance.now();
  try{
   const decoded=await this.decode(bytes),{rgb,alpha,width,height}=decoded;
   if(![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||width*height>80000000||!(rgb instanceof Uint8Array)||rgb.length!==width*height*3||!(alpha instanceof Uint8Array)||alpha.length!==width*height)throw Error('祛黑眼圈需要有效照片，单边2至32766像素，总像素不超过8000万');
   const detected=await this.landmarks.detect(bytes,{maxFaces:8,quality:true});
   if(detected.width!==width||detected.height!==height||!Array.isArray(detected.faces)||detected.faces.length>8)throw Error('祛黑眼圈人脸数据或照片尺寸无效');
   let mutable=rgb.slice();const faces=[],template194=detected.faces.length?inputAPI.template194():null;
   // Product scheduling: original RGB supplies detection and V2 protection;
   // each face repairs current RGB serially. Original whole scheduler unproved.
   for(const face of detected.faces){
    const source194=Float32Array.from(face.points194.flat()),geometry=this.geometry({source194,sourceWH:[width,height],template194});
    if(geometry.ROI[2]>4096||geometry.ROI[3]>4096)throw Error('当前人脸区域单边限4096像素，请缩小照片后重试');
    if(!Array.from(geometry.ROI).every((v,i)=>v>[-1,-1,9,9][i]))continue;
    const parsing=await this.parsing.prepare({rgb,width,height,points142:face.points142,angle:face.faceAngleRadiansCandidate});
    // Specific original LightenPouch handler packet +70=1 selects V2 plane2.
    // Other native callers/live defaults and first-face routing remain a boundary.
    const protection=this.workingMask({...parsing,parsingVersion:2,featureAvailable:true,planeWH:[384,384],savedParsingWH:[width,height],fullsourceWH:[width,height],sourceROI:Array.from(geometry.ROI),source194});
    const result=await this.runFace({source:mutable,width,height,geometry,workingMask:{data:protection.cache170,width:protection.width,height:protection.height},strength:controls.strength},(side,input)=>this.models.run(side,input));
    if(!result.processed)continue;
    mutable=result.output;
    for(let i=0;i<alpha.length;i++)if(alpha[i]===0){mutable[i*3]=rgb[i*3];mutable[i*3+1]=rgb[i*3+1];mutable[i*3+2]=rgb[i*3+2];}
    faces.push({ROI:Array.from(geometry.ROI),rois:result.rois,crops:result.crops,modelOrder:result.modelOrder,parsingVersion:2});
   }
   const png=faces.length?await this.encode({rgb:mutable,alpha,width,height}):Buffer.alloc(0);
   return {png,width,height,processedFaces:faces.length,detectedFaces:detected.detectedFaces??detected.faces.length,faces,seconds:(performance.now()-start)/1000,nativeApplicationParity:false};
  }catch(error){if(error instanceof Error&&error.message.includes('去眼袋'))throw Error(error.message.replaceAll('去眼袋','祛黑眼圈'),{cause:error});throw error;}
  finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const results=await Promise.allSettled([this.landmarks.close(),this.models.close(),this.parsing.close()]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;})();return this.closePromise;}
}
module.exports={DarkCirclesService};
