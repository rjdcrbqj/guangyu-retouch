'use strict';
const zlib=require('node:zlib');
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
const SIGNATURE=[137,80,78,71,13,10,26,10];
const CRC_TABLE=Uint32Array.from({length:256},(_,v)=>{
 let c=v;for(let bit=0;bit<8;bit++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0;
});
function checksum(a,start,end){
 let c=0xffffffff;for(let p=start;p<end;p++)c=(c>>>8)^CRC_TABLE[(c^a[p])&255];return (c^0xffffffff)>>>0;
}
function paeth(a,b,c){const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;}

// 仅解码实际供给PNG的编码RGB；不解释eXIf/iTXt，不代替原NativePhoto颜色管理。
function decodeSuppliedReferencePNG64(request){
 if(!request||request.policy!==POLICY||!(request.data instanceof Uint8Array))throw TypeError('参考PNG需要BYTE与显式raw样本policy');
 if(request.data.length<8||request.data.length>1048576)throw RangeError('参考PNG编码大小超出8..1MiB');
 const input=Buffer.from(request.data); // 包括SAB视图均在解析前成为私有副本。
 if(SIGNATURE.some((v,i)=>v!==input[i]))throw TypeError('参考PNG signature无效');
 let p=8,seenIDAT=false,closedIDAT=false,ended=false;
 const chunkTypes=[],ancillaryChunkTypes=[],parts=[];
 while(p<input.length){
  if(input.length-p<12)throw RangeError('参考PNG chunk被截断');
  const n=input.readUInt32BE(p),end=p+12+n;
  if(end>input.length)throw RangeError('参考PNG chunk数据被截断');
  const type=input.toString('latin1',p+4,p+8);
  if(!/^[A-Za-z]{4}$/.test(type)||(input[p+6]&32))throw TypeError('参考PNG chunk类型无效');
  if(checksum(input,p+4,p+8+n)!==input.readUInt32BE(p+8+n))throw TypeError('参考PNG CRC无效');
  if(chunkTypes.length===0&&type!=='IHDR')throw TypeError('参考PNG需要首IHDR');
  if(type==='IHDR'){
   if(chunkTypes.length||n!==13)throw TypeError('参考PNG IHDR重复或无效');
   if(input.readUInt32BE(p+8)!==64||input.readUInt32BE(p+12)!==64)throw RangeError('参考PNG仅支持64×64');
   if(input[p+16]!==8||input[p+17]!==6||input[p+18]!==0||input[p+19]!==0||input[p+20]!==0)throw TypeError('参考PNG仅支持RGBA8标准filter/compression无交错');
  }else if(type==='IDAT'){
   if(closedIDAT)throw TypeError('参考PNG IDAT须连续');
   seenIDAT=true;parts.push(input.subarray(p+8,p+8+n));
  }else if(type==='IEND'){
   if(n||!seenIDAT||end!==input.length)throw TypeError('参考PNG IEND/IDAT/尾部无效');
   ended=true;
  }else{
   if(type!=='eXIf'&&type!=='iTXt')throw TypeError('参考PNG metadata不在不变换供给范围');
   ancillaryChunkTypes.push(type);if(seenIDAT)closedIDAT=true;
  }
  chunkTypes.push(type);p=end;if(ended)break;
 }
 if(!ended)throw TypeError('参考PNG缺少IEND');
 const compressed=Buffer.concat(parts),expected=64*257;
 const inflated=zlib.inflateSync(compressed,{maxOutputLength:expected+1,info:true});
 if(inflated.buffer.length!==expected||inflated.engine.bytesWritten!==compressed.length)throw RangeError('参考PNG解压长度/压缩尾部无效');
 const raw=inflated.buffer,rgba=new Uint8Array(16384);
 for(let y=0;y<64;y++){
  const start=y*257,filter=raw[start];if(filter>4)throw TypeError('参考PNG filter无效');
  for(let x=0;x<256;x++){
   const at=y*256+x,a=x>=4?rgba[at-4]:0,b=y?rgba[at-256]:0,c=y&&x>=4?rgba[at-260]:0;
   const prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);
   rgba[at]=(raw[start+1+x]+prediction)&255;
  }
 }
 const output=new Uint8Array(12288);
 for(let i=0;i<4096;i++){
  if(rgba[i*4+3]!==255)throw TypeError('参考PNG只接受全不透明alpha255');
  output[i*3]=rgba[i*4];output[i*3+1]=rgba[i*4+1];output[i*3+2]=rgba[i*4+2];
 }
 return {data:output,width:64,height:64,stride:192,format:301,
  metadata:{chunkTypes,ancillaryChunkTypes,orientation:null,orientationParsed:false,transformApplied:false,sourceChannels:4,opaqueAlphaRemoved:true}};
}
module.exports={decodeSuppliedReferencePNG64};
