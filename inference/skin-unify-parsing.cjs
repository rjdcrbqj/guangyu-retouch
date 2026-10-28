'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),ort=require('onnxruntime-node');
const {prepareNativeV2Input}=require('./native-face-parsing-v2.cjs');
const MODEL_SHA256='bcc69d6266a7e7857c0f4ba11fd78191ede3b2948644004a39a5ec515c6e7a76',AREA=384*384;
// Full V2 planes, original F32 multiply and CVTT low BYTE packing.
// This modern ORT adapter does not claim original whole network scheduling.
class SkinUnifyParsing{
 constructor({file=path.join(__dirname,'assets/models/face-hair.onnx'),sessionFactory=bytes=>ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,graphOptimizationLevel:'all'})}={}){this.file=file;this.sessionFactory=sessionFactory;this.closed=false;this.running=false;}
 async session(){if(this.closed)throw Error('肤色统一分区后端已关闭');return this._sessionForActiveJob();}
 async _sessionForActiveJob(){
  if(!this.sessionPromise){const pending=(async()=>{const bytes=await fs.readFile(this.file);if(createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw Error('肤色统一分区原权重校验失败，请重新解压软件');return this.sessionFactory(bytes);})();this.sessionPromise=pending;pending.catch(()=>{if(this.sessionPromise===pending)this.sessionPromise=null;});}return this.sessionPromise;
 }
 async prepare(source){
  if(this.closed)throw Error('肤色统一分区后端已关闭');if(this.running)throw Error('肤色统一分区正在处理，请稍候');
  this.running=true;let finish;this.activeJob=new Promise(r=>finish=r);
  try{
   const prepared=prepareNativeV2Input(source),session=await this._sessionForActiveJob(),out=await session.run({'11':new ort.Tensor('float32',prepared.input,[1,3,384,384])}),tensor=out?.['81'];
   if(!tensor||!Array.isArray(tensor.dims)||tensor.dims.length!==4||!tensor.dims.every((v,i)=>v===[1,17,384,384][i])||!(tensor.data instanceof Float32Array)||tensor.data.length!==17*AREA||!tensor.data.every(Number.isFinite))throw Error('肤色统一分区模型输出无效');
   const parsingPlanes=new Uint8Array(tensor.data.length);
   for(let i=0;i<parsingPlanes.length;i++){const v=Math.fround(tensor.data[i]*255);if(!Number.isFinite(v)||v<-2147483648||v>=2147483648)throw Error('肤色统一分区模型输出超出原BYTE转换范围');parsingPlanes[i]=Math.trunc(v)&255;}
   return {parsingPlanes,savedParsingInverse:Float32Array.from(prepared.geometry.savedInverse)};
  }finally{this.running=false;finish();}
 }
 async close(){this.closed=true;if(!this.closePromise)this.closePromise=(async()=>{await this.activeJob;const session=await this.sessionPromise?.catch(()=>null);this.sessionPromise=null;if(session)await session.release();})();return this.closePromise;}
}
module.exports={SkinUnifyParsing,MODEL_SHA256};
