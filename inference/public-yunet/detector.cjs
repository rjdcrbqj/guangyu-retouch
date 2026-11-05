'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {openPublicPhoto}=require('../public-photo.cjs');
const ort=require('onnxruntime-node');
const SIDE=640,STRIDES=[8,16,32];
const MODEL_FILE='face_detection_yunet_2023mar.onnx';
const MODEL_SHA256='8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4';
const clamp=x=>Math.max(0,Math.min(1,x));

function checkedGeometry(g){
 if(!g||!['width','height','left','top'].every(k=>Number.isInteger(g[k]))||g.width<1||g.height<1||g.left<0||g.top<0||g.left+g.width>SIDE||g.top+g.height>SIDE)throw new RangeError('找脸预处理尺寸无效');
 return g;
}
function head(outputs,name,stride,channels){
 const t=outputs?.[`${name}_${stride}`],cells=(SIDE/stride)**2;
 if(!t||!(t.data instanceof Float32Array)||t.data.length!==cells*channels||!Array.isArray(t.dims)||t.dims.length!==3||t.dims[0]!==1||t.dims[1]!==cells||t.dims[2]!==channels||!t.data.every(Number.isFinite))throw new Error('公开找脸模型输出无效');
 return t.data;
}
function iou(a,b){
 const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
 return area/(a.width*a.height+b.width*b.height-area);
}
function unrotate(x,y,rotation){
 const angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=x-SIDE/2,dy=y-SIDE/2;
 return {x:SIDE/2+c*dx+s*dy,y:SIDE/2-s*dx+c*dy};
}
function rotateInput(input,rotation){
 const output=new Float32Array(input.length),plane=SIDE*SIDE;
 for(let y=0;y<SIDE;y++)for(let x=0;x<SIDE;x++){
  // Transform pixel centres, while model box coordinates use pixel boundaries.
  const p=unrotate(x+.5,y+.5,rotation),sx=p.x-.5,sy=p.y-.5,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const px=ix+dx,py=iy+dy;if(px<0||py<0||px>=SIDE||py>=SIDE)continue;
   const weight=(dx?fx:1-fx)*(dy?fy:1-fy),from=py*SIDE+px,to=y*SIDE+x;
   for(let c=0;c<3;c++)output[c*plane+to]+=input[c*plane+from]*weight;
  }
 }
 return output;
}

// YuNet's public tensor contract is documented in README.md. Our preprocessing
// letterboxes to the fixed model size; NMS retains floating-point box precision.
function decodeYuNet(outputs,{geometry={width:SIDE,height:SIDE,left:0,top:0},scoreThreshold=.8,nmsThreshold=.3,topK=5000,rotation=0}={}){
 const g=checkedGeometry(geometry);
 if(![0,45,-45].includes(rotation))throw new RangeError('找脸角度无效');
 if(!Number.isFinite(scoreThreshold)||scoreThreshold<=0||scoreThreshold>1||!Number.isFinite(nmsThreshold)||nmsThreshold<0||nmsThreshold>1||!Number.isInteger(topK)||topK<1||topK>5000)throw new RangeError('找脸阈值无效');
 const candidates=[];
 for(const stride of STRIDES){
  const cls=head(outputs,'cls',stride,1),obj=head(outputs,'obj',stride,1),bbox=head(outputs,'bbox',stride,4),kps=head(outputs,'kps',stride,10),cols=SIDE/stride;
  for(let i=0;i<cls.length;i++){
   const score=Math.sqrt(clamp(cls[i])*clamp(obj[i]));
   if(score<scoreThreshold)continue;
   const col=i%cols,row=Math.floor(i/cols);
   let width=Math.exp(bbox[i*4+2])*stride,height=Math.exp(bbox[i*4+3])*stride;
   let x=(col+bbox[i*4])*stride-width/2,y=(row+bbox[i*4+1])*stride-height/2;
   if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)throw new Error('公开找脸模型输出范围无效');
   if(rotation){
    const corners=[[x,y],[x+width,y],[x,y+height],[x+width,y+height]].map(([cx,cy])=>unrotate(cx,cy,rotation));
    x=Math.min(...corners.map(p=>p.x));y=Math.min(...corners.map(p=>p.y));
    width=Math.max(...corners.map(p=>p.x))-x;height=Math.max(...corners.map(p=>p.y))-y;
   }
   if(x+width<=g.left||y+height<=g.top||x>=g.left+g.width||y>=g.top+g.height)continue;
   const keypoints=Array.from({length:5},(_,n)=>{const p=unrotate((col+kps[i*10+n*2])*stride,(row+kps[i*10+n*2+1])*stride,rotation);return {x:(p.x-g.left)/g.width,y:(p.y-g.top)/g.height};});
   candidates.push({x,y,width,height,score,keypoints});
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 const keep=[];
 for(const candidate of candidates.slice(0,topK))if(keep.every(previous=>iou(previous,candidate)<=nmsThreshold))keep.push(candidate);
 return keep.map(box=>{
  const x=clamp((box.x-g.left)/g.width),y=clamp((box.y-g.top)/g.height);
  const right=clamp((box.x+box.width-g.left)/g.width),bottom=clamp((box.y+box.height-g.top)/g.height);
  return {x,y,width:right-x,height:bottom-y,score:box.score,keypoints:box.keypoints};
 });
}

async function prepareYuNet(bytes){
 const image=openPublicPhoto(bytes),meta=await image.metadata();
 const rotated=meta.orientation>=5&&meta.orientation<=8;
 const width=rotated?meta.height:meta.width,height=rotated?meta.width:meta.height;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('照片尺寸无效');
 const {data,info}=await image.rotate().flatten({background:'#000000'}).toColourspace('srgb').removeAlpha().resize({width:SIDE,height:SIDE,fit:'inside',kernel:'linear'}).raw().toBuffer({resolveWithObject:true});
 const geometry=checkedGeometry({width:info.width,height:info.height,left:Math.floor((SIDE-info.width)/2),top:Math.floor((SIDE-info.height)/2)});
 if(info.channels!==3||data.length!==info.width*info.height*3)throw new Error('照片颜色格式无效');
 const input=new Float32Array(3*SIDE*SIDE),plane=SIDE*SIDE;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const from=(y*info.width+x)*3,to=(y+geometry.top)*SIDE+x+geometry.left;
  input[to]=data[from+2];input[plane+to]=data[from+1];input[2*plane+to]=data[from];
 }
 return {input,geometry,width,height};
}

class PublicFaceDetector{
 constructor(modelFile=path.join(__dirname,MODEL_FILE)){this.modelFile=modelFile;this.closed=false;this.running=false;this.sessionPromise=null;this.activeJob=null;this.closePromise=null;}
 async _session(){
  if(!this.sessionPromise)this.sessionPromise=(async()=>{
   const bytes=await fs.readFile(this.modelFile);
   if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw new Error('公开找脸模型校验失败');
   return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],graphOptimizationLevel:'all'});
  })().catch(error=>{this.sessionPromise=null;throw error;});
  return this.sessionPromise;
 }
 async detect(bytes,{scoreThreshold=.8,rotationFallback=true}={}){
  if(this.closed)throw new Error('找脸服务已关闭');
  if(this.running)throw new Error('正在找脸，请稍候');
  this.running=true;let finish;this.activeJob=new Promise(resolve=>{finish=resolve;});
  const start=performance.now();
  try{
   if(!Number.isFinite(scoreThreshold)||scoreThreshold<=0||scoreThreshold>1)throw new RangeError('找脸阈值无效');
   if(typeof rotationFallback!=='boolean')throw new TypeError('倾斜找脸设置无效');
   const prepared=await prepareYuNet(bytes),session=await this._session();
   let boxes=[];const rotationsTried=[];
   for(const rotation of (rotationFallback?[0,45,-45]:[0])){
    const input=rotation?rotateInput(prepared.input,rotation):prepared.input;
    const outputs=await session.run({input:new ort.Tensor('float32',input,[1,3,SIDE,SIDE])});
    rotationsTried.push(rotation);boxes=decodeYuNet(outputs,{geometry:prepared.geometry,scoreThreshold,rotation});
    if(boxes.length)break;
   }
   return {boxes,width:prepared.width,height:prepared.height,seconds:(performance.now()-start)/1000,model:'YuNet 2023mar · MIT',scoreThreshold,preprocessing:'letterbox-bgr-0-255',rotationsTried};
  }finally{this.running=false;finish();}
 }
 async close(){
  this.closed=true;
  if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const session=await this.sessionPromise?.catch(()=>null);this.sessionPromise=null;if(session)await session.release();})();
  return this.closePromise;
 }
}
module.exports={PublicFaceDetector,decodeYuNet,prepareYuNet,MODEL_FILE,MODEL_SHA256};
