'use strict';
const path=require('node:path'),sharp=require('sharp');
const {FaceDetector}=require('./face-detect.cjs');
const {normalizeCrop,manifest}=require('./assets/portrait-repair/repair-backend.cjs');
const {CorrectedPortraitRepair}=require('./portrait-repair-models.cjs');
const {splitMainOutput,freckleInput}=require('./assets/portrait-repair/repair-contract.cjs');
const {postprocess}=require('./assets/portrait-repair/repair-postprocess.cjs');
const {composeMask,applyResidual}=require('./assets/portrait-repair/repair-blend.cjs');
const SIDE=768,MAX_PIXELS=80000000;
// Independent detector-box crop matching the validated portrait trial. Original
// native 194-point alignment and original application color order are not claimed.
function faceCrop(box,w,h){const x=box.x*w,y=box.y*h,bw=box.width*w,bh=box.height*h;const left=Math.max(0,Math.floor(x-.33*bw)),top=Math.max(0,Math.floor(y-.40*bh)),right=Math.min(w,Math.ceil(x+1.33*bw)),bottom=Math.min(h,Math.ceil(y+1.35*bh));return{left,top,width:right-left,height:bottom-top};}
function resizeFloat(src,sw,sh,dw,dh,channels=1){
 const dst=new Float32Array(dw*dh*channels);
 for(let y=0;y<dh;y++){const fy=Math.max(0,Math.min(sh-1,(y+.5)*sh/dh-.5)),y0=Math.floor(fy),y1=Math.min(sh-1,y0+1),dy=fy-y0;
  for(let x=0;x<dw;x++){const fx=Math.max(0,Math.min(sw-1,(x+.5)*sw/dw-.5)),x0=Math.floor(fx),x1=Math.min(sw-1,x0+1),dx=fx-x0;
   for(let c=0;c<channels;c++){const a=src[(y0*sw+x0)*channels+c]*(1-dx)+src[(y0*sw+x1)*channels+c]*dx,b=src[(y1*sw+x0)*channels+c]*(1-dx)+src[(y1*sw+x1)*channels+c]*dx;dst[(y*dw+x)*channels+c]=a*(1-dy)+b*dy;}
  }
 }return dst;
}
class PortraitRepair{
 constructor({detector=new FaceDetector(),backend=new CorrectedPortraitRepair()}={}){this.detector=detector;this.backend=backend;this.running=false;}
 async repair(bytes,{strengths={},colorOrder='BGR',maxFaces=8}={}){
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('照片内容无效');
  if(this.running)throw new Error('人像修复正在处理，请稍候');
  if(!['RGB','BGR'].includes(colorOrder))throw new Error('人像修复颜色格式无效');
  if(!Number.isInteger(maxFaces)||maxFaces<1||maxFaces>32)throw new Error('处理人数无效');
  const params={blemish:.4,acne:.8,freckle:.65,removeNevi:false,...strengths};
  for(const k of ['blemish','acne','freckle'])if(!Number.isFinite(params[k])||params[k]<0||params[k]>1)throw new Error('修复强度必须在 0 到 1 之间');
  if(typeof params.removeNevi!=='boolean')throw new Error('祛痣开关无效');
  this.running=true;const start=performance.now();
  try{
   const detection=await this.detector.detect(bytes),{data,info}=await sharp(Buffer.from(bytes),{limitInputPixels:MAX_PIXELS,failOn:'error'}).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
   if(info.channels!==4||info.width!==detection.width||info.height!==detection.height)throw new Error('照片尺寸或颜色格式无效');
   const output=Buffer.from(data),faces=detection.boxes.slice(0,maxFaces),boxes=[];
   // Independent paste-back policy: every candidate is based on original pixels.
   // In overlapping crops, the largest quantized mask wins; ties keep the first
   // face. Residuals are never accumulated across independently inferred faces.
   const strongestMask=faces.length>1?new Uint8Array(info.width*info.height):null;
   for(const face of faces){
    const roi=faceCrop(face,info.width,info.height);if(roi.width<2||roi.height<2)continue;
    const crop=await sharp(data,{raw:info}).extract(roi).resize(SIDE,SIDE,{fit:'fill',kernel:'linear'}).removeAlpha().raw().toBuffer();
    const input=normalizeCrop(crop,{width:SIDE,height:SIDE,colorOrder}),main=await this.backend.runTensor('blemish',input,[1,3,SIDE,SIDE]);
    const split=splitMainOutput(input,main.data),fm=await this.backend.runTensor('freckle',freckleInput(input,split.mask),[1,4,SIDE,SIDE]),am=await this.backend.runTensor('acne',input,[1,3,SIDE,SIDE]),nm=await this.backend.runTensor('nevus',input,[1,3,SIDE,SIDE]);
    const masks=postprocess({main:split.mask,freckle:fm.data,acne:am.data,nevus:nm.data}),weighted=composeMask({...masks,settings:{remaining:params.blemish,acne:params.acne,freckle:params.freckle,removeNevus:params.removeNevi}}).mask;
    const mappedMask=resizeFloat(weighted,SIDE,SIDE,roi.width,roi.height),mappedResidual=resizeFloat(split.residual,SIDE,SIDE,roi.width,roi.height,3),count=roi.width*roi.height,source=new Uint8Array(count*4),mask=new Uint8Array(count);
    for(let y=0;y<roi.height;y++)for(let x=0;x<roi.width;x++){const i=y*roi.width+x,j=((roi.top+y)*info.width+roi.left+x)*4;for(let c=0;c<3;c++)source[i*4+c]=data[j+(colorOrder==='RGB'?c:2-c)];source[i*4+3]=data[j+3];mask[i]=Math.max(0,Math.min(255,Math.round(mappedMask[i])));}
    const result=applyResidual({source,residual:mappedResidual,roiMask:new Uint8Array(count).fill(255),strengthMask:mask,channels:4}).output;
    for(let y=0;y<roi.height;y++)for(let x=0;x<roi.width;x++){
     const local=y*roi.width+x,global=(roi.top+y)*info.width+roi.left+x;
     if(mask[local]===0||(strongestMask&&mask[local]<=strongestMask[global]))continue;
     if(strongestMask)strongestMask[global]=mask[local];
     for(let c=0;c<3;c++)output[global*4+c]=result[local*4+(colorOrder==='RGB'?c:2-c)];
    }
    boxes.push({...face,crop:roi});
   }
   const png=await sharp(output,{raw:info}).png().toBuffer();
   return{png,boxes,width:info.width,height:info.height,seconds:(performance.now()-start)/1000,detectedFaces:detection.boxes.length,processedFaces:boxes.length,model:'原模型人像修复 · 实验',modelInfo:{resourceIds:Object.values(manifest.models).map(m=>m.resourceId),colorOrder,colorOrderStatus:'candidate',roi:'independent detector-box crop',overlap:'independent maximum quantized strength mask; first face wins ties; original pixel base',postprocess:'recovered scalar native formulas; JS morphology checked against OpenCV',nativeApplicationParity:false},strengths:params};
  }finally{this.running=false;}
 }
 async close(){await this.backend.close();}
}
let shared;
async function repair(bytes,options){if(!shared)shared=new PortraitRepair();return shared.repair(bytes,options);}
module.exports={PortraitRepair,repair,faceCrop,resizeFloat};
