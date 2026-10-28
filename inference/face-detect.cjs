const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const ort=require('onnxruntime-node');
const sharp=require('sharp');

const MODEL_SHA256='0300a86a5c04af0a569295c46cce07d57240c30645dfb06fefba3b19ab77ca7e';
const SIDE=384,MAX_PIXELS=80000000;
const NMS_THRESHOLD=Math.fround(.4); // 148f3a420, selected by caller 14713b6a0.
const ANCHORS=[[[4,4],[6,7],[9,11]],[[14,18],[24,33],[45,62]],[[75,97],[100,138],[177,189]]];
const OUTPUTS=['62','24','30'];
const sigmoid=x=>1/(1+Math.exp(-x));

// Native planar decoder 14713c090, called by 14713b6a0, matches this model's
// NCHW output contract and consumes objectness alone. Resource-to-runner binding
// is not fully resolved; variant selection is corroborated by six photo trials.
// Its objectness threshold at 148e1945c is .5, used as the default here.
// Native suppression divides intersection by the smaller area, not the union.
// Stable descending score order is an independent tie-handling choice.
function suppressFaces(boxes,threshold=NMS_THRESHOLD){
 const retained=[];
 for(const box of [...boxes].sort((a,b)=>b.score-a.score)){
  const area=box.width*box.height;
  if(retained.some(other=>{
   const intersection=Math.max(0,Math.min(box.x+box.width,other.x+other.width)-Math.max(box.x,other.x))*Math.max(0,Math.min(box.y+box.height,other.y+other.height)-Math.max(box.y,other.y));
   return intersection/Math.min(area,other.width*other.height)>threshold;
  }))continue;
  retained.push(box);
 }
 return retained;
}

function decodeHeads(heads,{scoreThreshold=.5,nmsThreshold=NMS_THRESHOLD,geometry={left:0,top:0,width:SIDE,height:SIDE}}={}){
 if(!Number.isFinite(scoreThreshold)||scoreThreshold<=0||scoreThreshold>=1||!Number.isFinite(nmsThreshold)||nmsThreshold<0||nmsThreshold>1)throw new Error('找脸阈值无效');
 if(!Array.isArray(heads)||heads.length!==3)throw new Error('找脸模型输出尺寸无效');
 if(!geometry||![geometry.left,geometry.top,geometry.width,geometry.height].every(Number.isInteger)||geometry.left<0||geometry.top<0||geometry.width<1||geometry.height<1||geometry.left+geometry.width>SIDE||geometry.top+geometry.height>SIDE)throw new Error('找脸预处理几何无效');
 const boxes=[];
 for(let head=0;head<3;head++){
  const stride=8*2**head,n=SIDE/stride,plane=n*n,{data,dims}=heads[head]||{};
  if(!dims||dims.length!==4||!dims.every((v,i)=>v===[1,18,n,n][i])||!(data instanceof Float32Array)||data.length!==18*plane||!data.every(Number.isFinite))throw new Error('找脸模型输出无效');
  for(let anchor=0;anchor<3;anchor++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const at=anchor*6*plane+y*n+x,score=sigmoid(data[at+4*plane]);
   if(score<scoreThreshold)continue;
   const cx=((sigmoid(data[at])*2-.5+x)*stride-geometry.left)/geometry.width,cy=((sigmoid(data[at+plane])*2-.5+y)*stride-geometry.top)/geometry.height;
   const width=(sigmoid(data[at+2*plane])*2)**2*ANCHORS[head][anchor][0]/geometry.width;
   const height=(sigmoid(data[at+3*plane])*2)**2*ANCHORS[head][anchor][1]/geometry.height;
   boxes.push({x:cx-width/2,y:cy-height/2,width,height,score});
  }
 }
 // Suppress before clipping so photo boundaries do not change overlap ratios.
 return suppressFaces(boxes,nmsThreshold).map(box=>{
  const left=Math.max(0,Math.min(1,box.x)),top=Math.max(0,Math.min(1,box.y));
  const right=Math.max(0,Math.min(1,box.x+box.width)),bottom=Math.max(0,Math.min(1,box.y+box.height));
  return {x:left,y:top,width:right-left,height:bottom-top,score:box.score};
 }).filter(box=>box.width>0&&box.height>0);
}

class FaceDetector{
 constructor(assets=path.join(__dirname,'assets')){this.assets=assets;this.running=false;this.sessionPromise=null;this.closed=false;}
 async session(){
  if(this.closed)throw new Error('找脸模型后端已关闭');return this._sessionForActiveJob();
 }
 async _sessionForActiveJob(){
  if(!this.sessionPromise)this.sessionPromise=(async()=>{
   // assets remains the shared resource root; only this corrected model is routed.
   const bytes=await fs.readFile(path.join(this.assets,'face-detect-corrected','face-detect.onnx'));
   if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw new Error('找脸原模型校验失败，请重新解压软件');
   return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,graphOptimizationLevel:'all'});
  })().catch(error=>{this.sessionPromise=null;throw error;});
  return this.sessionPromise;
 }
 async detect(bytes,{scoreThreshold=.5,preprocessing='letterbox-rgb'}={}){
  if(this.closed)throw new Error('找脸模型后端已关闭');
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('照片内容无效');
  if(!Number.isFinite(scoreThreshold)||scoreThreshold<=0||scoreThreshold>=1)throw new Error('找脸阈值无效');
  if(preprocessing!=='letterbox-rgb')throw new Error('尚未验证该找脸预处理方式');
  if(this.running)throw new Error('找脸模型正在处理，请稍候');
  this.running=true;let finish;this.activeJob=new Promise(r=>finish=r);const start=performance.now();
  try{
   let decoded;
   try{decoded=await sharp(Buffer.from(bytes),{limitInputPixels:MAX_PIXELS,failOn:'error'}).rotate().toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});}
   catch(error){throw new Error('无法读取照片，请使用不超过 8000 万像素的有效图片',{cause:error});}
   const {data,info}=decoded;
   if(info.width*info.height>MAX_PIXELS||info.channels!==3)throw new Error('照片尺寸或颜色格式无效');
   // Independent aspect-preserving letterbox, RGB /255, black padding.
   // The native format enum, exact interpolation and caller margin are not
   // claimed numerically equivalent to this integration implementation.
   const scale=SIDE/Math.max(info.width,info.height);
   const width=Math.max(1,Math.round(info.width*scale)),height=Math.max(1,Math.round(info.height*scale));
   const geometry={width,height,left:Math.floor((SIDE-width)/2),top:Math.floor((SIDE-height)/2)};
   const small=await sharp(data,{raw:info}).resize(width,height,{fit:'fill',kernel:'linear'}).png().toBuffer();
   const resized=await sharp({create:{width:SIDE,height:SIDE,channels:3,background:'black'}}).composite([{input:small,left:geometry.left,top:geometry.top}]).removeAlpha().raw().toBuffer();
   if(resized.length!==3*SIDE*SIDE)throw new Error('找脸预处理颜色格式无效');
   const input=new Float32Array(3*SIDE*SIDE);
   for(let i=0;i<SIDE*SIDE;i++)for(let c=0;c<3;c++)input[c*SIDE*SIDE+i]=resized[i*3+c]/255;
   const session=await this._sessionForActiveJob(),outputs=await session.run({'100':new ort.Tensor('float32',input,[1,3,SIDE,SIDE])});
   const boxes=decodeHeads(OUTPUTS.map(name=>outputs[name]),{scoreThreshold,geometry});
   return {boxes,width:info.width,height:info.height,seconds:(performance.now()-start)/1000,model:'原模型试验 · 自动找脸',scoreThreshold,preprocessing};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const session=await this.sessionPromise?.catch(()=>null);this.sessionPromise=null;if(session)await session.release();})();return this.closePromise;}
}
module.exports={FaceDetector,decodeHeads,suppressFaces};
