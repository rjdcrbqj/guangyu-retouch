'use strict';
const {resizeReferenceMono64}=require('./mono64.cjs');
// 只做 Electron 通道适配：把渲染端供给原样交给 SkinReferenceProcessor。
// 不制造默认掩码/默认参数，不推断业务身份，不做数学。
// 本通道只接受已解码的原始像素帧；编码图像（dataURL/压缩字节）必须由调用方
// 在进入本通道之前自行解码为原始像素，本通道不做任何解码或魔数猜测。

// 入口 processor.run 快照所要求的必需供给；缺失即明确报错。
const REQUIRED=['workingPhoto','geometry','blendMask','secondaryTestMask','intensity','referenceRevision'];

function createSkinReferenceHandler({processor}={}){
 if(!processor||typeof processor.run!=='function')throw TypeError('参考通道需要具备run的处理器');
 return async function handleSkinReference(_event,payload){
  if(payload===null||typeof payload!=='object'||Array.isArray(payload))throw TypeError('参考作业参数无效');
  for(const key of REQUIRED)
   if(payload[key]===undefined)throw TypeError('参考作业缺少必需供给：'+key);
  // 参考蒙版必须真实供应：最终64×64，或由主进程用已验证mono64放大的裁切块。
  // 调用方的手工选区不能当作原版 M6。
  if(payload.referenceMask===undefined&&payload.referenceMaskCrop===undefined)
   throw TypeError('参考作业缺少真实referenceMask（64×64 BYTE1）或referenceMaskCrop；本通道不制造默认掩码');
  if(payload.original===undefined)throw TypeError('参考作业缺少必需供给：original');
  // 只接受显式原始像素帧。字符串（dataURL 等编码图像）一律拒绝：即使附带了
  // 宽高/stride/channels 布局也不解码，因为编码字节不是像素。
  if(typeof payload.original==='string'||payload.original===null||typeof payload.original!=='object')
   throw TypeError('参考作业的original需要已解码原始像素帧，不接受编码图像字符串');
  if(!(payload.original.data instanceof Uint8Array))
   throw TypeError('参考作业的original需要已解码原始像素帧（data为BYTE）');
  return processor.run(withResizedReferenceMask({...payload}));
 };
}
// 参考蒙版裁切块 -> 64×64，必须用已验证的 native code2 标量数学（mono64），
// 不使用任何自造插值。渲染端只能传裁切块，因为浏览器ESM无法require本CJS。
function withResizedReferenceMask(payload){
 const crop=payload.referenceMaskCrop;
 if(crop===undefined)return payload;
 if(payload.referenceMask!==undefined)throw TypeError('参考作业的referenceMask与referenceMaskCrop不能并用');
 const {data,width,height,stride}=crop||{};
 if(!(data instanceof Uint8Array)||!Number.isInteger(width)||!Number.isInteger(height)||
  width<1||height<1||width>64||height>64||!Number.isSafeInteger(stride)||stride<width||
  stride*height>data.length)
  throw TypeError('referenceMaskCrop需要1..64的BYTE1裁切块及有效stride');
 const resized=resizeReferenceMono64({data,width,height,stride,math:'native-code2-scalar'});
 const {referenceMaskCrop,...rest}=payload;
 return {...rest,referenceMask:{data:resized.data,width:64,height:64,stride:64}};
}

module.exports={createSkinReferenceHandler,withResizedReferenceMask};
