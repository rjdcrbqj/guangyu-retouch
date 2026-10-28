'use strict';

// caller供应已完成resize的physical BYTE3/4工作图和实际BYTE表；不自动假定原global初始化。
function prepareSuppliedSecondaryLookupGray(r){
 if(!r||r.math!=='native-cvt6-u8-generic-then-lut0')throw TypeError('二次保护gray需要明确code6/实际LUT供给');
 const supplied=r.table;
 if(supplied===undefined||supplied===null)return {available:false,lookupGray:null};
 if(!(supplied instanceof Uint8Array)||supplied.length!==256)throw TypeError('二次保护gray需要实际256BYTE表');
 const table=new Uint8Array(supplied),photo=r.photo;
 if(!photo)throw TypeError('二次保护gray缺少工作图');
 const {width,height,stride,channels,data}=photo,last=(height-1)*stride+width*channels;
 if(![width,height].every(v=>Number.isInteger(v)&&v>=1&&v<=512)||![3,4].includes(channels))throw RangeError('二次保护gray工作图WH1..512/cn3或4');
 if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width*channels||!Number.isSafeInteger(last)||data.length<last)throw TypeError('二次保护gray工作图缓冲无效');
 const source=new Uint8Array(data),output=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*stride+x*channels;
  const gray=(source[p]*3735+source[p+1]*19235+source[p+2]*9798+16384)>>15;
  output[y*width+x]=table[gray];
 }
 return {available:true,lookupGray:{data:output,width,height,stride:width}};
}
module.exports={prepareSuppliedSecondaryLookupGray};
