'use strict';

// 只接受精确有符号64位初值，避免Number隐式丢失整数精度。
function initialInteger(v){
 if(v===undefined)return 0n;
 if(typeof v==='number'&&Number.isSafeInteger(v))v=BigInt(v);
 if(typeof v!=='bigint'||v<-(1n<<63n)||v>=(1n<<63n))throw TypeError('参考补充判断初始累积无效');
 return v;
}

// 对独立判定掩码选中的ROI累积原图减处理图；第四通道和padding不计。
function scoreSuppliedReferenceDifference(r){
 if(!r)throw TypeError('参考补充判断参数不完整');
 const {original,processed,mask,width,height,originalChannels,processedChannels,originalStride,processedStride,maskStride}=r;
 const begin=r.startRow??0,end=r.endRow??height;
 if(![width,height,begin,end,originalStride,processedStride,maskStride].every(Number.isSafeInteger)||
  width<1||width>4096||height<1||height>4096||begin<0||end<begin||end>height||
  ![3,4].includes(originalChannels)||![3,4].includes(processedChannels)||originalStride<width*originalChannels||processedStride<width*processedChannels||maskStride<width||
  ![original,processed,mask].every(v=>v instanceof Uint8Array)||
  !Number.isSafeInteger(originalStride*height)||original.length<originalStride*height||
  !Number.isSafeInteger(processedStride*height)||processed.length<processedStride*height||
  !Number.isSafeInteger(maskStride*height)||mask.length<maskStride*height)throw TypeError('参考补充判断ROI缓冲无效');
 let score=initialInteger(r.initialScore),count=initialInteger(r.initialCount);
 for(let y=begin;y<end;y++)for(let x=0;x<width;x++){
  if(mask[y*maskStride+x]===0)continue;
  const i=y*originalStride+x*originalChannels,j=y*processedStride+x*processedChannels;
  const delta=114*(original[i]-processed[j])+587*(original[i+1]-processed[j+1])+299*(original[i+2]-processed[j+2]);
  score=BigInt.asIntN(64,score+BigInt(delta));count=BigInt.asIntN(64,count+1n);
 }
 return {score,count,trigger:count!==0n&&score>BigInt.asIntN(64,25000n*count)};
}
module.exports={scoreSuppliedReferenceDifference};
