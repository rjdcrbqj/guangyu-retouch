"use strict";
const {PublicFaceDetector}=require('../public-yunet/detector.cjs'),{PublicFaceLandmarks}=require('../public-landmarks/service.cjs');
const {preparePublicEyes,prepareEyeSizeFace,separateEyeSizeFaces}=require('./geometry.cjs');
const sharp=require('sharp'),{eyeVisibility}=require('./visibility.cjs');

async function visibleEyeSides(bytes,sides){
  const visible=[];
  for(const side of sides){
    const [left,top,width,height]=side.roi;
    const rgb=await sharp(bytes,{limitInputPixels:80000000}).rotate().extract({left,top,width,height})
      .flatten({background:'#000000'}).toColourspace('srgb').removeAlpha()
      .resize(side.maskWidth,side.maskHeight,{kernel:'linear'}).raw().toBuffer();
    if(eyeVisibility(side,rgb).visible)visible.push(side);
  }
  return visible;
}

class PublicBrightEyeService{
  constructor({detector=new PublicFaceDetector(),landmarks=new PublicFaceLandmarks()}={}){
    this.detector=detector;this.landmarks=landmarks;this.closed=false;this.running=false;this.active=null;this.closing=null;
  }

  async withPreparation(bytes,prepare){
    if(this.closed)throw Error('亮眼识别服务已关闭');
    if(this.running)throw Error('正在识别眼睛，请稍候');
    if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw Error('照片内容无效');
    this.running=true;
    let finish;
    this.active=new Promise(resolve=>finish=resolve);
    const start=performance.now();
    try{
      const found=await this.detector.detect(bytes);
      return await prepare(found,start);
    }finally{this.running=false;finish();}
  }

  async locateFace(bytes,box,{width,height}){
    const face=await this.landmarks.detect(bytes,box);
    if(face.width!==width||face.height!==height)throw Error('眼部定位与照片尺寸不匹配');
    return face;
  }

  async prepare(bytes){
    return this.withPreparation(bytes,async(found,start)=>{
      const faces=[];
      for(const box of found.boxes.slice(0,8)){
        const landmarks=await this.locateFace(bytes,box,found);
        const face=preparePublicEyes(landmarks);
        if(face.sides.length)faces.push(face);
      }
      const visibleFaces=[];
      for(const face of faces){
        const sides=await visibleEyeSides(bytes,face.sides);
        if(sides.length)visibleFaces.push({...face,sides});
      }
      return {faces:visibleFaces,sourceWH:[found.width,found.height],processedFaces:visibleFaces.length,
        detectedFaces:found.boxes.length,seconds:(performance.now()-start)/1000,backend:'public-478-eye-masks'};
    });
  }

  async prepareEyeSize(bytes){
    return this.withPreparation(bytes,async found=>{
      const candidates=[];
      for(const box of found.boxes.slice(0,8)){
        let landmarks;
        try{landmarks=await this.locateFace(bytes,box,found);}
        catch(error){
          if(error.code==='ERR_PUBLIC_LANDMARKS_UNRELIABLE')continue;
          throw error;
        }
        const {sides}=preparePublicEyes(landmarks);
        if(sides.length!==2)continue;
        const eyes=prepareEyeSizeFace(landmarks);
        if(eyes&&(await visibleEyeSides(bytes,sides)).length===2)candidates.push(eyes);
      }
      return {sourceWH:[found.width,found.height],faces:separateEyeSizeFaces(candidates),detectedFaces:found.boxes.length};
    });
  }

  async close(){
    this.closed=true;
    if(!this.closing)this.closing=(async()=>{
      await this.active;
      await Promise.all([this.landmarks.close(),this.detector.close()]);
    })();
    return this.closing;
  }
}

module.exports={PublicBrightEyeService};
