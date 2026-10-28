'use strict';
const sharp=require('sharp'),ort=require('onnxruntime-node');
const {OriginalFaceLandmarks}=require('./face-landmarks.cjs');
const {FaceSkin,probabilityBytes}=require('./face-skin.cjs');
const {nativeSkinGeometry,prepareNativeSkinInput,projectNativeSkinPlane}=require('./native-skin-geometry.cjs');
const {NativeAttribute034}=require('./native-attribute034.cjs'),{NativeAttribute86}=require('./native-attribute86.cjs');
const {estimateAttributeGeometry}=require('./native-attributes-auto-geometry.cjs');
const {estimateGeometry194}=require('./wrinkle-geometry.cjs'),{prepare1024}=require('./wrinkle-alignment.cjs');
const {OriginalWrinklePipeline}=require('./wrinkle-pipeline.cjs'),{applyEncoded}=require('./wrinkle-postprocess.cjs');
const {nativeAttributeContext,nativeRegion9Protection}=require('./wrinkle-native-context.cjs');
const {initializeOpenCV}=require('./opencv-runtime.cjs');
const MAX_PIXELS=80000000;
const {resolveWrinkleStrengths}=require('./wrinkle-region-parameters.cjs');
class OriginalWrinklePhoto{
 constructor({landmarks=new OriginalFaceLandmarks(),skin=new FaceSkin(),attributes034=new NativeAttribute034(),attributes86=new NativeAttribute86(),pipeline=new OriginalWrinklePipeline()}={}){Object.assign(this,{landmarks,skin,attributes034,attributes86,pipeline});this.closed=false;}
 repair(bytes,options={}){
  if(this.closed)return Promise.reject(new Error('祛皱照片后端已关闭'));
  if(this.activeJob)return Promise.reject(new Error('祛皱照片正在处理，请稍候'));
  const job=this._repair(bytes,options);this.activeJob=job;return job.finally(()=>{if(this.activeJob===job)this.activeJob=null;});
 }
 async skinMask(rgb,width,height,points,trig){
  const geometry=nativeSkinGeometry(points,trig),input=prepareNativeSkinInput({rgb,width,height,nativeAffineFloat32:geometry.affine});
  const session=await this.skin.session(),outputs=await session.run({'12':new ort.Tensor('float32',input,[1,3,256,256])}),out=outputs['39'];
  if(!out||JSON.stringify(out.dims)!=='[1,7,256,256]'||out.data.length!==7*256*256)throw new Error('原皮肤模型输出无效');
  const skin=probabilityBytes(out.data.subarray(256*256,2*256*256));
  return {mask:projectNativeSkinPlane({plane:skin,inverse:geometry.inverse,sourceCoordinateWidth:width,sourceCoordinateHeight:height,targetWidth:width,targetHeight:height}),geometry};
 }
 async _repair(bytes,{strength=.5,maxFaces=8,regionsPercent}={}){
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('照片内容无效');
  const regionOptions=resolveWrinkleStrengths({strength,regionsPercent}),strengths=regionOptions.strengths;
  if(!Number.isInteger(maxFaces)||maxFaces<1||maxFaces>8)throw new Error('处理人数无效');
  const start=performance.now(),detection=await this.landmarks.detect(bytes,{maxFaces}),{data,info}=await sharp(Buffer.from(bytes),{limitInputPixels:MAX_PIXELS,failOn:'error'}).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.channels!==4||info.width!==detection.width||info.height!==detection.height)throw new Error('照片尺寸或颜色格式无效');
  const {width,height}=info,rgb=new Uint8Array(width*height*3);for(let i=0;i<width*height;i++)rgb.set(data.subarray(i*4,i*4+3),i*3);
  let output=new Uint8Array(data),firstAttributes;const boxes=[];
  await initializeOpenCV();
  // Whole-face selection is a deliberate integration scope, separate from the
  // original params+370 secondary mask. Missing secondary mask uses proven zero fallback.
  const selection=new Uint8Array(width*height).fill(255),zeroSecondary1536=new Uint8Array(1536*1536);
  for(const face of detection.faces){
   const attrGeometry=estimateAttributeGeometry(face.points194),source={rgb,width,height};
   const attributes={...await this.attributes034.inferAttribute0({...source,nativeAffineFloat32:attrGeometry.affine0}),...await this.attributes034.inferAttribute34({...source,nativeAffineFloat32:attrGeometry.affine34}),...await this.attributes86.infer({...source,nativeAffineFloat32:attrGeometry.affine86})};
   if(!firstAttributes)firstAttributes=attributes;
   const context=nativeAttributeContext(attributes,firstAttributes),geometry=estimateGeometry194({points:face.points194,width,height}),{mask:skin,geometry:skinGeometry}=await this.skinMask(rgb,width,height,face.points194,attrGeometry.trig);
   const prepared=prepare1024({data:rgb,width,height,points:face.points194,...geometry,perFaceMask:skin,perFaceWidth:width,perFaceHeight:height,combinedMask:selection,combinedWidth:width,combinedHeight:height,colorOrder:'BGR'});
   const protection9=nativeRegion9Protection({alignedAuxiliaryByteMask1536:zeroSecondary1536,aligned194:prepared.aligned194,nativeContextInt:context.nativeContextInt,rawRegion9Strength:strengths[9],previousFlag:false});
   const result=await this.pipeline.processPrepared({prepared,strengths,...context,nativeRegion9ProtectionFlag:protection9.nativeRegion9ProtectionFlag,nativeScalar358:prepared.nativeScalar358,nativeCandidateCount:detection.faces.length,stage2Threshold:.3,cpuMode:'scalar',auxiliary:{mode:'native',attributes:{attribute0:attributes[0],attribute3:attributes[3],attribute4:attributes[4],attributeScores5678:[5,6,7,8].map(i=>attributes[i]),getters34Succeeded:true}}});
   output=applyEncoded({source:output,width,height,channels:4,encoded:result.encoded,roi:result.roi,cpuMode:'scalar'}).output;
   boxes.push({...face.box,crop:geometry.roi,skinCrop:{bounds:skinGeometry.bounds,affine:Array.from(skinGeometry.affine),inverse:Array.from(skinGeometry.inverse),side:skinGeometry.side},attributes,context,protection9,activeSlots:result.activeSlots,stage2Tiles:result.tiles.length,stage2Skipped:Boolean(result.stage2Skipped),auxiliaryActive:Boolean(result.auxiliary?.metadata?.active)});
  }
  const png=await sharp(Buffer.from(output),{raw:info}).png().toBuffer();
  return {png,boxes,width,height,processedFaces:boxes.length,detectedFaces:detection.detectedFaces??detection.faces.length,seconds:(performance.now()-start)/1000,strength:regionOptions.mode==='overall'?strength:undefined,wrinkleMode:regionOptions.mode,rawStrengths:strengths,enabledSlots:regionOptions.enabled,regionsPercent:regionOptions.regionsPercent,model:'原模型祛皱 · 实验',modelInfo:{nativeApplicationParity:false,parameters:'recovered nine property flags to ten raw slots; eye90023 shared slots3/4; candidate percent→F32 UI boundary, original asynchronous map store unverified',colorOrder:'BGR candidate',landmarks:'original142+52 models; recovered FLOAT BGR primary/auxiliary sampling and F32 decode; native F32 auxiliary fit verified on controlled finite fixtures; independent detector bbox/nine-angle search/JS trig',geometry:'original templates/formulas, native F32 fit and SSE angle arguments verified on controlled finite fixtures; independent aligned-group layout and JS atan2/trig',skin:'original V1 model, recovered first142 crop/FLOAT BGR input/plane1 BYTE/general V1 linear zero-border projection; independent inferred points/trig and coordinate dimensions; original AIMaskService type2 production unverified',selection:'whole-face processing selection',secondaryProtection:'original missing params+370 zero BYTE fallback; valid type5 beardMask production unverified',stage2Threshold:Math.fround(.3),stage2ThresholdStatus:'recovered float32 default in original1447fb090/144802800 builders; explicit diagnostic callers may override',overlap:'sequential quantized residual addition with per-face saturation',resources:[323773030,2722162333,3941563283,970914372,1979284778,4101772452,32332505,1110763825,575083021]}};
 }
 async close(){
  this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{if(this.activeJob)await this.activeJob.catch(()=>{});await Promise.all([this.landmarks.close(),this.attributes034.close(),this.attributes86.close(),this.pipeline.close()]);for(const pending of [this.landmarks.detector?.sessionPromise,this.skin.sessionPromise])if(pending){const [r]=await Promise.allSettled([pending]);if(r.status==='fulfilled')await r.value.release();}})();return this.closePromise;
 }
}
let shared;async function repair(bytes,options){if(!shared)shared=new OriginalWrinklePhoto();return shared.repair(bytes,options);}
module.exports={OriginalWrinklePhoto,repair};
