'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const POLICY='normal-source-icc-gamma-off-generic-code4';
const SHA256='a0b937d1a6eab0d439e2f634b60f44ca23758670a9e8fb0c67cdd951646ccb82';
const ASSET=path.join(__dirname,'../assets/skin-reference/default-lut-normal-source-rgb301.bin');

// 正常初始化及generic code4条件候选；不会从运行时自动推断这些条件。
function loadNormalSourceReferenceColorMap(request={}){
 if(!request||request.policy!==POLICY)throw TypeError('defaultLUT需要明确normal-source条件声明');
 const {filePath=ASSET,readFile=fs.readFileSync}=request;
 if(typeof readFile!=='function')throw TypeError('defaultLUT资产读取接口无效');
 const supplied=readFile(filePath);
 if(!(supplied instanceof Uint8Array))throw TypeError('defaultLUT资产需要BYTE');
 if(supplied.length!==786432)throw RangeError('defaultLUT资产长度无效');
 const lut=Uint8Array.from(supplied);
 if(crypto.createHash('sha256').update(lut).digest('hex')!==SHA256)throw Error('defaultLUT资产SHA256不匹配');
 const coordinates=Int32Array.from({length:256},(_,v)=>Math.max(32*v-1,0));
 const axis0=new Int32Array(65),axis1=new Int32Array(65),axis2=new Int32Array(65);
 for(let i=0;i<=64;i++){
  const j=Math.min(i,63);axis0[i]=j*3;axis1[i]=j*1536;
  axis2[i]=Math.floor(j/8)*64*1536+(j%8)*64*3;
 }
 return {
  colorMap:{lut,lutSize:512,lutFormat:301,lutStride:1536,coordinates,axis0,axis1,axis2,rounding:'integer-sar7-sar14'},
  provenance:Object.freeze({policy:POLICY,assetSHA256:SHA256,
   sourcePNGsha256:'91c5570b6a9f3f18a10b1fc6384920cd7e7e30047c20329f0003dfeaf75f371b',
   actualOriginalDecoderExecuted:false,allCPUEquivalenceEstablished:false})
 };
}
module.exports={loadNormalSourceReferenceColorMap};
