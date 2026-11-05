'use strict';
const f=Math.fround;

// 仅削弱明确供应的BYTE掩码，保留原F32顺序与低BYTE转换。
function suppressSuppliedReferenceMask(r){
 if(!r)throw TypeError('参考保护削弱参数不完整');
 const {mask,protection,width,height,maskStride,protectionStride,factor}=r;
 const begin=r.startRow??0,end=r.endRow??height;
 if(![width,height,maskStride,protectionStride,begin,end].every(Number.isSafeInteger)||width<1||width>4096||height<1||height>4096||
  begin<0||end<begin||end>height||maskStride<width||protectionStride<width||
  !(mask instanceof Uint8Array)||!(protection instanceof Uint8Array)||
  !Number.isSafeInteger(maskStride*height)||mask.length<maskStride*height||
  !Number.isSafeInteger(protectionStride*height)||protection.length<protectionStride*height||
  typeof factor!=='number'||!Number.isFinite(factor)||!Number.isFinite(f(factor))||f(factor)<f(-.1)||f(factor)>2)throw TypeError('参考保护削弱缓冲或强度无效');
 const output=new Uint8Array(mask),unit=f(f(factor)/255);
 for(let y=begin;y<end;y++)for(let x=0;x<width;x++){
  const at=y*maskStride+x,guard=protection[y*protectionStride+x],value=mask[at];
  if(value===0||guard===0)continue;
  const remaining=f(1-f(guard*unit));
  output[at]=Math.trunc(f(value*remaining))&255; // 原scalar无钳制；负factor可能绕回低BYTE。
 }
 return output;
}
module.exports={suppressSuppliedReferenceMask};
