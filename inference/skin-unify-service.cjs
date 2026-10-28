'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {OriginalFaceLandmarks}=require('./face-landmarks.cjs'),{NativeAttribute86}=require('./native-attribute86.cjs'),{estimateAttributeGeometry}=require('./native-attributes-auto-geometry.cjs'),{SkinUnifyModels}=require('./skin-unify-models.cjs'),{SkinUnifyParsing}=require('./skin-unify-parsing.cjs'),{decodePhoto,encodePhoto}=require('./eye-bag-service.cjs');
const geometryModule=require('./skin-unify/geometry.cjs'),inputModule=require('./skin-unify/input.cjs'),core=require('./skin-unify/core.cjs'),selection=require('./skin-unify/selection.cjs'),gray=require('./skin-unify/gray-resize.cjs'),area=require('./skin-unify/gray-area.cjs');
async function originalTemplate(){const b=await fs.readFile(path.join(__dirname,'assets/skin-unify/template194.f32'));if(createHash('sha256').update(b).digest('hex')!=='b12ff073f968795611b860d17fb6ab65efabcce19a6f63b2f6b9452f98ef741d')throw Error('肤色统一原模板校验失败，请重新解压软件');return new Float32Array(Uint8Array.from(b).buffer);}
function strengthFromPercent(value){if(typeof value!=='number'||!Number.isFinite(value)||value<1||value>100)throw Error('请把肤色统一强度设置为1至100');return Math.fround(value/100);}
function imageState(rgb,width,height){const cached32=width===64&&height===64?area.gray32RGB64(rgb):gray.linear32(rgb,width,height);return selection.allChannelsWithin(Uint8Array.from(cached32),10);}
function validateROI(ROI,width,height){if(!(ROI instanceof Int32Array)||ROI.length!==4||ROI[0]<0||ROI[1]<0||ROI[2]<0||ROI[3]<0||ROI[0]+ROI[2]>width||ROI[1]+ROI[3]>height)throw Error('肤色统一人脸区域无效');if(ROI[2]>4096||ROI[3]>4096)throw Error('当前人脸区域单边限4096像素，请缩小照片后重试');}
class SkinUnifyService{
 constructor({landmarks=new OriginalFaceLandmarks(),attributes=new NativeAttribute86(),models=new SkinUnifyModels(),parsing=new SkinUnifyParsing(),decode=decodePhoto,encode=encodePhoto,template=originalTemplate,geometry=geometryModule.prepare,attributeGeometry=estimateAttributeGeometry,imageState:state=imageState,prepareInput=inputModule.prepare,runFace=core.runFace}={}){Object.assign(this,{landmarks,attributes,models,parsing,decode,encode,template,geometry,attributeGeometry,imageState:state,prepareInput,runFace});this.closed=false;this.running=false;}
 async repair(bytes,options={}){
  if(this.closed)throw Error('肤色统一后端已关闭');if(this.running)throw Error('肤色统一正在处理，请稍候');const strength=strengthFromPercent(options.strengthPercent);if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('照片内容无效');
  this.running=true;let finish;this.activeJob=new Promise(r=>finish=r);const start=performance.now();
  try{
   const {rgb,alpha,width,height}=await this.decode(bytes);if(![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=32766)||width*height>80000000||!(rgb instanceof Uint8Array)||rgb.length!==width*height*3||!(alpha instanceof Uint8Array)||alpha.length!==width*height)throw Error('肤色统一需要有效照片，单边2至32766像素，总像素不超过8000万');
   const detected=await this.landmarks.detect(bytes,{maxFaces:8});if(detected.width!==width||detected.height!==height||!Array.isArray(detected.faces)||detected.faces.length>8)throw Error('肤色统一人脸数据或照片尺寸无效');
   const target194=detected.faces.length?await this.template():null;let mutable=rgb.slice(),state;const faces=[];
   // 自有串行调度：检测/属性/分区读取原RGB，残差处理逐脸读取当前RGB。
   for(const face of detected.faces){
    if(!Array.isArray(face.points194)||face.points194.length!==194||face.points194.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('肤色统一194人脸关键点无效');
    const geometry=this.geometry({source194:Float32Array.from(face.points194.flat()),target194,fullWH:[width,height]});validateROI(geometry.ROI,width,height);if(!geometry.ROI[2]||!geometry.ROI[3])continue;
    if(state===undefined){state=await this.imageState(rgb,width,height);if(typeof state!=='boolean')throw Error('肤色统一图像状态无效');}
    const attrGeometry=this.attributeGeometry(face.points194),attribute=await this.attributes.infer({rgb,width,height,nativeAffineFloat32:attrGeometry.affine86});
    const supplied=attribute&&Object.hasOwn(attribute,'readStatus')?attribute:{scores:attribute,readStatus:0};const {classId,key}=selection.select({...supplied,state});
    const parsing=await this.parsing.prepare({rgb,width,height,points142:face.points142,angle:face.faceAngleRadiansCandidate});
    const prepared=this.prepareInput({source012:mutable,width,height,forward:geometry.inputForward}),heads=await this.models.run(key,prepared.input),before=mutable;
    const result=await this.runFace({source:mutable,width,height,geometry,heads,...parsing,strength});if(!result||typeof result.processed!=='boolean'||!(result.output instanceof Uint8Array)||result.output.length!==rgb.length)throw Error('肤色统一贴回结果无效');if(!result.processed)continue;mutable=result.output;
    for(let i=0;i<alpha.length;i++)if(alpha[i]===0){mutable[i*3]=rgb[i*3];mutable[i*3+1]=rgb[i*3+1];mutable[i*3+2]=rgb[i*3+2];}
    let changedRGBFields=0;const [x,y,w,h]=geometry.ROI;for(let row=y;row<y+h;row++)for(let i=(row*width+x)*3,end=i+w*3;i<end;i++)if(mutable[i]!==before[i])changedRGBFields++;
    faces.push({ROI:Array.from(geometry.ROI),classId,key,changedRGBFields});
   }
   let changedRGBFields=0;for(let i=0;i<rgb.length;i++)if(mutable[i]!==rgb[i])changedRGBFields++;
   const png=faces.length?await this.encode({rgb:mutable,alpha,width,height}):Buffer.alloc(0);return {png,width,height,processedFaces:faces.length,detectedFaces:detected.detectedFaces,faces,changedRGBFields,seconds:(performance.now()-start)/1000,nativeApplicationParity:false};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const results=await Promise.allSettled([this.landmarks.close(),this.attributes.close(),this.models.close(),this.parsing.close()]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;})();return this.closePromise;}
}
module.exports={SkinUnifyService,strengthFromPercent,imageState};
