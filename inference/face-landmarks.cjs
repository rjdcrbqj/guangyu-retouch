'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const ort=require('onnxruntime-node'),sharp=require('sharp');
const {FaceDetector}=require('./face-detect.cjs');
const nativePrimary=require('./native-primary142.cjs'),nativeAuxiliary=require('./native-aux52-float.cjs');
const {nativeSimilarity}=require('./native-fit.cjs');
const {decodePrimary142Quality}=require('./native-primary142-quality.cjs');
const AUXILIARY_SHA256='e062613ee3061d93dd822846ca389e0d9ed19dff4b113468f8974c73aea7b41d';
const PRIMARY_RULES=[[[60,61],59,62],[[67,68],66,69],[[84],83,85],[[86],85,87],[[88],87,89],[[90],89,91],[[92],91,93],[[94],73,93],[[107,108],89,125]];
const AUXILIARY_RULES=[...Array.from({length:12},(_,i)=>[[24+2*i],23+2*i,25+2*i]),[[49],48,50],[[51],50,11]];
function validPoints(points,count){if(!Array.isArray(points)||points.length!==count||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw new Error('关键点数量或坐标无效');}
// 用原构造147aee1f0与插值147af2a60恢复模型占位点。
function interpolateNative(points,role){const count=role==='primary'?142:role==='auxiliary'?52:0;if(!count)throw new Error('关键点模型角色无效');validPoints(points,count);const out=points.map(p=>[...p]);for(const [targets,a,b] of role==='primary'?PRIMARY_RULES:AUXILIARY_RULES)for(let j=0;j<targets.length;j++)for(let c=0;c<2;c++)out[targets[j]][c]=out[a][c]+(out[b][c]-out[a][c])*(j+1)/(targets.length+1);return out;}
function validAffine(m){if(!Array.isArray(m)||m.length!==2||!m.every(row=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite)))throw new Error('人脸仿射矩阵无效');}
function transformPoints(points,m){validAffine(m);return points.map(([x,y])=>[m[0][0]*x+m[0][1]*y+m[0][2],m[1][0]*x+m[1][1]*y+m[1][2]]);}
// 二维无反射最小二乘相似变换，与研究接口的SVD解同一目标函数。
function similarity(source,target){validPoints(source,source.length);validPoints(target,source.length);if(source.length<2)throw new Error('关键点退化，无法配准');const mean=p=>p.reduce((a,v)=>[a[0]+v[0]/p.length,a[1]+v[1]/p.length],[0,0]),sm=mean(source),tm=mean(target);let dot=0,cross=0,variance=0;source.forEach(([x,y],i)=>{x-=sm[0];y-=sm[1];const tx=target[i][0]-tm[0],ty=target[i][1]-tm[1];dot+=x*tx+y*ty;cross+=x*ty-y*tx;variance+=x*x+y*y;});if(variance<=1e-12)throw new Error('关键点退化，无法配准');const a=dot/variance,b=cross/variance;return [[a,-b,tm[0]-a*sm[0]+b*sm[1]],[b,a,tm[1]-b*sm[0]-a*sm[1]]];}
function inverseAffine(m){validAffine(m);const d=m[0][0]*m[1][1]-m[0][1]*m[1][0];if(Math.abs(d)<1e-12)throw new Error('人脸仿射矩阵退化');const a=m[1][1]/d,b=-m[0][1]/d,c=-m[1][0]/d,e=m[0][0]/d;return [[a,b,-a*m[0][2]-b*m[1][2]],[c,e,-c*m[0][2]-e*m[1][2]]];}
function decodePoints(values,count,scale,m,role){if(!(values instanceof Float32Array)||values.length!==count*2||!values.every(Number.isFinite))throw new Error('原关键点模型输出无效');const points=Array.from({length:count},(_,i)=>[Math.fround(values[i*2]*scale),Math.fround(values[i*2+1]*scale)]);return interpolateNative(transformPoints(points,m),role);}
function decodePrimary(values,m){return decodePoints(values,142,160,m,'primary');}
function decodeAuxiliary(values,m){return decodePoints(values,52,1,m,'auxiliary');}
// 原144e6cab0/144e68c60从singleton的142行起顺序复制face+320，保留主点顺序。
function assembleNative194(primary,auxiliary){validPoints(primary,142);validPoints(auxiliary,52);return [...primary,...auxiliary].map(p=>[...p]);}
// 按像素中心双线性采样，黑色边界；独立裁切策略沿用已验证研究探针。
function warpRGB(data,w,h,side,inverse){validAffine(inverse);if(!(data instanceof Uint8Array)||data.length!==w*h*3)throw new Error('照片像素无效');const out=new Uint8Array(side*side*3);for(let y=0;y<side;y++)for(let x=0;x<side;x++){const px=inverse[0][0]*(x+.5)+inverse[0][1]*(y+.5)+inverse[0][2],py=inverse[1][0]*(x+.5)+inverse[1][1]*(y+.5)+inverse[1][2];if(px<0||py<0||px>=w||py>=h)continue;const sx=Math.max(0,px-.5),sy=Math.max(0,py-.5),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),dx=sx-x0,dy=sy-y0;for(let c=0;c<3;c++){const a=data[(y0*w+x0)*3+c]*(1-dx)+data[(y0*w+x1)*3+c]*dx,b=data[(y1*w+x0)*3+c]*(1-dx)+data[(y1*w+x1)*3+c]*dx;out[(y*side+x)*3+c]=Math.floor(a*(1-dy)+b*dy);}}return out;}
function tensorBGR(bytes,side){const area=side*side,out=new Float32Array(area*3);for(let i=0;i<area;i++)for(let c=0;c<3;c++)out[c*area+i]=bytes[i*3+2-c];return new ort.Tensor('float32',out,[1,3,side,side]);}
class OriginalFaceLandmarks{
 constructor({detector=new FaceDetector(),directory=path.join(__dirname,'assets','face-landmarks'),auxiliaryDirectory=path.join(__dirname,'assets','auxiliary52-corrected')}={}){this.detector=detector;this.directory=directory;this.auxiliaryDirectory=auxiliaryDirectory;this.sessions=new Map();this.running=false;this.closed=false;this.activeJobs=new Set();}
 async configuration(){if(!this.config)this.config=JSON.parse(await fs.readFile(path.join(this.directory,'manifest.json'),'utf8'));return this.config;}
 async auxiliaryConfiguration(){if(!this.auxiliaryConfig)this.auxiliaryConfig=JSON.parse(await fs.readFile(path.join(this.auxiliaryDirectory,'manifest.json'),'utf8'));return this.auxiliaryConfig;}
 async session(role){
  if(this.closed)throw new Error('关键点后端已关闭');
  const config=await this.configuration(),modelConfig=role==='auxiliary'?await this.auxiliaryConfiguration():config;
  if(this.closed)throw new Error('关键点后端已关闭');
  const model=modelConfig.models[role],directory=role==='auxiliary'?this.auxiliaryDirectory:this.directory;
  if(role==='auxiliary'&&model.sha256!==AUXILIARY_SHA256)throw new Error('原辅助关键点模型校验失败');
  if(!this.sessions.has(role)){
   const promise=(async()=>{const bytes=await fs.readFile(path.join(directory,model.file));if(createHash('sha256').update(bytes).digest('hex')!==model.sha256)throw new Error('原关键点模型校验失败');return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1});})();
   this.sessions.set(role,promise);promise.catch(()=>{if(this.sessions.get(role)===promise)this.sessions.delete(role);});
  }
  return this.sessions.get(role);
 }
 async track(work){if(this.closed)throw new Error('关键点后端已关闭');let finish;const active=new Promise(resolve=>{finish=resolve;});this.activeJobs.add(active);try{return await work();}finally{this.activeJobs.delete(active);finish();}}
 async inferFace(...args){return this.track(()=>this._inferFace(...args));}
 async _inferFace(data,w,h,box,{quality=false}={}){
  if(typeof quality!=='boolean')throw new Error('关键点质量选项无效');
  const config=await this.configuration(),primary=await this.session('primary'),auxiliary=await this.session('auxiliary');
  const bbox=[box.x*w,box.y*h,box.width*w,box.height*h];let best;
  // 保留独立九角策略；每次原模型输入采用查明的椭圆框、FLOAT BGR与半像素采样。
  for(let angle=-60;angle<=60;angle+=15){
   const radians=angle*Math.PI/180,geometry=nativePrimary.bboxAffine({bbox,nativeSin:Math.fround(Math.sin(-radians)),nativeCos:Math.fround(Math.cos(-radians))});
   const sampled=nativePrimary.sampleRawBGR({rgb:data,width:w,height:h,affine:nativePrimary.samplingAffine(geometry.affine)});
   const output=await primary.run({'1511':new ort.Tensor('float32',sampled.input,[1,3,160,160])});
   if(!output['1627']||!output['287'])throw new Error('原主关键点模型输出无效');
   const inverse=nativePrimary.inverse(geometry.affine),decoded=nativePrimary.decode({output287:output['287'].data,output1627:output['1627'].data,nativeInverseFloat32:inverse});
   const points142=Array.from({length:142},(_,i)=>Array.from(decoded.points.subarray(i*2,i*2+2)));
   if(!best||decoded.score>best.score)best={angle,score:decoded.score,points142,cropToImage:[Array.from(inverse.subarray(0,3)),Array.from(inverse.subarray(3,6))],faceAngleArgumentsYX:Array.from(decoded.angleArgumentsYX),faceAngleRadiansCandidate:Math.fround(Math.atan2(...decoded.angleArgumentsYX)),...(quality?{quality142:decodePrimary142Quality(output['2032']?.data,1)}:{})};
  }
  // 原33点模板与原F32均值/Jacobi SVD/post配准；受控原函数夹具逐位核验。
  const aligned=Float32Array.from(nativeSimilarity(config.template.indices.map(i=>best.points142[i]),config.template.template).flat());
  const prepared=nativeAuxiliary.prepare({rgb:data,width:w,height:h,nativeAffineFloat32:aligned});
  const output=await auxiliary.run({'24':new ort.Tensor('float32',prepared.input,[1,3,128,128])}),values=output['50'];
  if(!values)throw new Error('原辅助关键点模型输出无效');
  const decoded=nativeAuxiliary.decode({output50:values.data,nativeDecodeInverseFloat32:prepared.decodeInverse}),points52=Array.from({length:52},(_,i)=>Array.from(decoded.subarray(i*2,i*2+2)));
  return {...best,points52,points194:assembleNative194(best.points142,points52),box,assemblyStatus:'recovered native sequential append',roiPolicy:'recovered native FLOAT BGR sampling/decode and native F32 auxiliary fit verified on controlled finite fixtures; independent detector bbox, nine-angle search and JS trig',nativeApplicationParity:false};
 }
 async detect(...args){return this.track(()=>this._detect(...args));}
 async _detect(bytes,{maxFaces=8,quality=false}={}){if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('照片内容无效');if(!Number.isInteger(maxFaces)||maxFaces<1||maxFaces>32)throw new Error('处理人数无效');if(typeof quality!=='boolean')throw new Error('关键点质量选项无效');if(this.running)throw new Error('关键点正在处理，请稍候');this.running=true;try{const detection=await this.detector.detect(bytes),{data,info}=await sharp(Buffer.from(bytes),{limitInputPixels:80000000}).rotate().toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});if(info.channels!==3||info.width!==detection.width||info.height!==detection.height)throw new Error('照片颜色或尺寸无效');const faces=[];for(const box of detection.boxes.slice(0,maxFaces))faces.push(await this.inferFace(data,info.width,info.height,box,{quality}));return {width:info.width,height:info.height,faces,detectedFaces:detection.boxes.length,resourceIds:[323773030,2722162333]};}finally{this.running=false;}}
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await Promise.all(this.activeJobs);const sessions=await Promise.allSettled(this.sessions.values());this.sessions.clear();await Promise.all([...sessions.filter(s=>s.status==='fulfilled').map(s=>s.value.release()),this.detector.close?.()]);})();return this.closePromise;}
}
module.exports={OriginalFaceLandmarks,interpolateNative,similarity,transformPoints,inverseAffine,decodePrimary,decodeAuxiliary,assembleNative194,warpRGB};

