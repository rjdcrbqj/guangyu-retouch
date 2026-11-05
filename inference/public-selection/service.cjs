'use strict';
const path=require('node:path'),{createHash}=require('node:crypto'),sharp=require('sharp');
const {PublicSegmentationRuntime}=require('../public-segmentation/runtime.cjs');
const {projectConfidence}=require('../public-segmentation/service.cjs');
function validateBytes(bytes){if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw new Error('照片数据无效');}
class PublicSelection{
 constructor({runtime=new PublicSegmentationRuntime({workerFile:path.join(__dirname,'worker.html'),taskName:'Selection'})}={}){this.runtime=runtime;this.running=false;this.closed=false;this.active=null;this.closing=null;this.prepared=null;}
 async inspect(bytes){
  validateBytes(bytes);await sharp(bytes,{limitInputPixels:80000000}).metadata();
  return {available:true,sha256:createHash('sha256').update(bytes).digest('hex'),backend:'public-magictouch',reason:'可直接点击照片选中目标；Shift+点击减去，可用画笔修补边缘。'};
 }
 async segment(bytes,points,width,height){
  if(this.closed)throw new Error('点选服务已关闭');if(this.running)throw new Error('正在计算选区，请稍候');validateBytes(bytes);
  if(!Array.isArray(points)||points.length!==1||points[0]?.label!==1||![points[0]?.x,points[0]?.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('点选每次需要一个有效正点，加减在蒙版层执行');
  if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=1600))throw new Error('蒙版尺寸最长边不能超过 1600 像素');
  this.running=true;let finish;this.active=new Promise(r=>finish=r);const start=performance.now();
  try{
   const imageKey=createHash('sha256').update(bytes).digest('hex');
   if(this.prepared?.imageKey!==imageKey){
    const image=sharp(bytes,{limitInputPixels:80000000}),meta=await image.metadata(),swapped=meta.orientation>=5&&meta.orientation<=8;
    const sourceWidth=swapped?meta.height:meta.width,sourceHeight=swapped?meta.width:meta.height;
    const png=await image.rotate().flatten({background:'#000000'}).toColourspace('srgb').removeAlpha().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true,kernel:'linear'}).png().toBuffer();
    this.prepared={imageKey,image:'data:image/png;base64,'+png.toString('base64'),sourceWidth,sourceHeight};
   }
   const {image,sourceWidth,sourceHeight}=this.prepared,point={x:points[0].x,y:points[0].y};
   const result=await this.runtime.run({image,imageKey,point});
   const alpha=projectConfidence(result,{left:0,top:0,width:sourceWidth,height:sourceHeight},sourceWidth,sourceHeight,width,height,1024),rgba=Buffer.alloc(width*height*4,255);
   let foreground=0;for(let i=0;i<alpha.length;i++){rgba[i*4+3]=alpha[i];if(alpha[i]>127)foreground++;}
   const png=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
   return {mask:png.toString('base64'),width,height,sha256:imageKey,points:1,foregroundFraction:foreground/alpha.length,seconds:(performance.now()-start)/1000,model:'MediaPipe MagicTouch V2 · Apache-2.0',backend:'public-magictouch'};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closing)this.closing=(async()=>{await this.active;this.prepared=null;await this.runtime.close();})();return this.closing;}
}
module.exports={PublicSelection};
