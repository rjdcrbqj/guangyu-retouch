// 把产品自身数据组装成 SkinReferenceProcessor.run 接受的请求。
// 只做"显式数据 -> 既有入口契约"的组装：不制造默认掩码/默认强度/默认几何，
// 缺失或不一致一律报错。几何是整幅工作图到768模型输入的真实比例，不是虚构回退。
const f=Math.fround,SIDE=768,MAX_ROI=4096;

const dim=v=>Number.isInteger(v)&&v>=2&&v<=32766;
const byte1=o=>o&&o.data instanceof Uint8Array&&dim(o.width)&&dim(o.height)&&
 Number.isSafeInteger(o.stride)&&o.stride>=o.width&&o.stride*o.height<=o.data.length;
const byte301=o=>o&&o.data instanceof Uint8Array&&dim(o.width)&&dim(o.height)&&o.format===301&&
 Number.isSafeInteger(o.stride)&&o.stride>=o.width*3&&o.stride*o.height<=o.data.length;

// 整数最近邻重采样：只用于把画布分辨率的选区映射到原图分辨率。
function resampleNearest(mask,outW,outH){
 const {data,width,height,stride}=mask,out=new Uint8Array(outW*outH);
 for(let y=0;y<outH;y++){
  const sy=Math.min(height-1,Math.floor(y*height/outH));
  for(let x=0;x<outW;x++){
   const sx=Math.min(width-1,Math.floor(x*width/outW));
   out[y*outW+x]=data[sy*stride+sx];
  }
 }
 return {data:out,width:outW,height:outH,stride:outW};
}

// 选区包围盒：在给定分辨率下求非零像素的最小外接矩形，并校验 4096 上限。
function selectionBounds(mask,width,height){
 const {data,stride}=mask;
 let minX=width,minY=height,maxX=-1,maxY=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(data[y*stride+x]){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
 }
 if(maxX<0)throw RangeError('参考作业需要非空的选区（blendMask全为0）');
 const w=maxX-minX+1,h=maxY-minY+1;
 if(w>MAX_ROI||h>MAX_ROI)
  throw RangeError('选区包围盒超出已验证的4096上限，本函数不缩小替代；请缩小选区');
 return Int32Array.from([minX,minY,w,h]);
}

function buildReferenceJobRequest(supplies){
 if(supplies===null||typeof supplies!=='object')throw TypeError('参考作业组装需要显式供给');
 const {originalPixels,originalWidth,originalHeight,workingPhoto,currentMask,referencePNG,referenceMask,referenceMaskCrop,blendMask,secondaryTestMask,intensity,referenceRevision,colorMapRequired,colorMap,secondaryProtection,secondaryProtectionStride,secondaryPreparation,secondaryPostBlend,selectionSupply,baseMask}=supplies;
 if(!(originalPixels instanceof Uint8Array)||!dim(originalWidth)||!dim(originalHeight)||
  originalPixels.length<originalWidth*originalHeight*4)
  throw TypeError('参考作业需要完整的RGBA原始像素帧（按原图分辨率）');
 if(!byte301(workingPhoto))throw TypeError('参考作业需要明确301工作图');
 // 原图保持全分辨率（派生照片要保留原图尺寸）；ROI 取选区包围盒并受 4096 上限约束。
 // 这样超大照片仍可用参考，而不是整张拒绝；包围盒本身超限才明确拒绝。
 // 两种蒙版选路互斥：手工 currentMask（临时）或 selectionSupply+baseMask（真实typed选路）。
 // processor 已实现该互斥；builder 只负责透传并尊重它，不代为选择。
 const hasManual=currentMask!==undefined;
 const hasTyped=selectionSupply!==undefined||baseMask!==undefined;
 if(hasManual&&hasTyped)throw TypeError('参考作业的currentMask与selectionSupply/baseMask选路互斥，不能并用');
 if(hasManual){
  if(!byte1(currentMask))throw TypeError('参考作业需要currentMask（BYTE1）；本函数不制造默认蒙版');
 }else if(hasTyped){
  if(selectionSupply===undefined||baseMask===undefined)
   throw TypeError('参考作业提供selectionSupply时必须同时提供baseMask');
  if(!(baseMask.data instanceof Uint8Array)||!Number.isInteger(baseMask.width)||!Number.isInteger(baseMask.height)||
   !Number.isSafeInteger(baseMask.stride)||baseMask.stride<baseMask.width||baseMask.stride*baseMask.height>baseMask.data.length)
   throw TypeError('参考作业的baseMask必须是完整BYTE1');
 }else{
  throw TypeError('参考作业需要currentMask或selectionSupply+baseMask二者之一');
 }
 // 当前蒙版是模型输入侧的选区（模型会把它warp到768）；允许它按原图分辨率或画布分辨率给出，
 // 因为它不作为结果ROI的缓冲。真正的ROI缓冲是blendMask。
 // 当前蒙版只作为模型输入侧的选区，尺寸由调用方按自己的分辨率给出；
 // 这里不再加4096限制（那是结果ROI的约束），但要求它是完整的BYTE1。

 // referencePNG 必须带调用方声明的真实policy；本函数不代为选择解码政策。
 if(!referencePNG||!(referencePNG.data instanceof Uint8Array)||typeof referencePNG.policy!=='string'||!referencePNG.policy)
  throw TypeError('参考作业需要referencePNG（BYTE）及其显式policy，本函数不代为选择解码政策');
 // 参考蒙版可以是最终64×64 BYTE1，也可以是1..64的裁切块——
 // 后者由主进程适配层用已验证的 mono64 放大（渲染端是浏览器ESM，不能require该CJS）。
 if(referenceMask===undefined&&referenceMaskCrop===undefined)
  throw TypeError('参考作业需要referenceMask（64×64 BYTE1）或referenceMaskCrop（1..64裁切块）');
 if(referenceMask!==undefined&&referenceMaskCrop!==undefined)
  throw TypeError('参考作业的referenceMask与referenceMaskCrop不能并用');
 const cropSupplied=referenceMaskCrop!==undefined;
 if(cropSupplied){
  const c=referenceMaskCrop;
  if(!c||!(c.data instanceof Uint8Array)||!Number.isInteger(c.width)||!Number.isInteger(c.height)||
   c.width<1||c.height<1||c.width>64||c.height>64||!Number.isSafeInteger(c.stride)||
   c.stride<c.width||c.stride*c.height>c.data.length)
   throw TypeError('referenceMaskCrop需要1..64的BYTE1裁切块及有效stride');
 }else if(!byte1(referenceMask))throw TypeError('参考作业需要真实referenceMask（64×64 BYTE1）');
 // blendMask 必须与"结果ROI"同尺寸。ROI 现在是原图分辨率，而选区在画布分辨率，
 // 因此需要按整数最近邻把选区重采样到原图尺寸（与裁切同一整数规则，不引入新算法）。
 if(!byte1(blendMask))
  throw RangeError('参考作业需要blendMask（BYTE1）；本函数不制造默认混合掩码');
 const blendAtRoi=(blendMask.width===originalWidth&&blendMask.height===originalHeight)
  ? blendMask
  : resampleNearest(blendMask,originalWidth,originalHeight);
 // 全零混合掩码等于"没有任何像素允许改变"，结果必然与原件逐字节相同。
 // 那是白跑一次模型并生成无意义的派生照片，因此在提交前直接拒绝，并提示用户先画选区。
 if(!blendMask.data.some(v=>v!==0))
  throw RangeError('参考作业需要非空的选区（blendMask全为0）；请先在照片上涂选皮肤区域');
 // secondaryTestMask 必须显式声明：真实BYTE1，或显式null表示"无二次保护区域"。
 // 不用 undefined 静默补零，避免把"未提供"伪装成"确认无保护"。
 if(secondaryTestMask===undefined)throw TypeError('参考作业需要secondaryTestMask供给；无二次保护时请显式传null');
 const declaredEmpty=secondaryTestMask===null;
 if(!declaredEmpty&&!byte1(secondaryTestMask))
  throw RangeError('参考作业的secondaryTestMask必须是BYTE1，或显式null');
 // 与blendMask同理：必须与结果ROI同尺寸。
 const secondaryAtRoi=declaredEmpty
  ? null
  : (secondaryTestMask.width===originalWidth&&secondaryTestMask.height===originalHeight)
    ? secondaryTestMask
    : resampleNearest(secondaryTestMask,originalWidth,originalHeight);
 if(!Number.isFinite(intensity)||!Number.isFinite(f(intensity)))throw TypeError('参考作业需要有限的intensity供给');
 // color-map 由调用方显式供给；声明为 true 时必须给 colorMap，否则显式拒绝。
 // 不自动生成 colorMap（与证据一致：原版是 packet394/helper+d8 运行时判定，产品是显式供给）。
 if(colorMapRequired===true&&colorMap===undefined)
  throw TypeError('参考作业声明colorMapRequired=true时必须供给colorMap');
 if(!Number.isSafeInteger(referenceRevision)||referenceRevision<0)throw TypeError('参考作业需要非负的referenceRevision');
 const w=workingPhoto.width,h=workingPhoto.height;
 // ROI = 选区包围盒（在原图分辨率下），必须非空且 <= 4096。
 // 这样超大照片仍可用参考，而不是整张拒绝；包围盒本身超限才明确拒绝。
 const roi=selectionBounds(blendMask,originalWidth,originalHeight);
 // 工作图 -> 768：等比缩放并居中留边，**不能**两轴各自拉伸。
 // 说明：这是产品侧的选择（等比+居中），不是原版规则；原版用194点人脸相似变换，
 // 取色路径没有可用的人脸点，因此不套用。
 const uni=f(SIDE/Math.max(w,h));
 const inputForward=Float32Array.from([uni,0,f(f(SIDE-f(w*uni))*0.5),0,uni,f(f(SIDE-f(h*uni))*0.5)]);
 // postAffine在结果写回阶段为恒等。
 // 注意（诚实标注）："整幅"是当前唯一可用的合理选择，不是已证实的原版几何。
 // 原版参考基准使用"照片决定的square context"，其真实来源（整图/裁切/人脸）尚未闭合；
 // 若上游确认不是整幅，本函数必须改为接受调用方显式几何，而不是在此猜测。
 const postAffine=Float32Array.from([1,0,0,0,1,0]);
 return {
  original:{data:originalPixels,width:originalWidth,height:originalHeight,stride:originalWidth*4,channels:4},
  workingPhoto,
  ...(selectionSupply!==undefined?{selectionSupply,baseMask}:{temporaryMask:currentMask}),
  geometry:{valid:true,originalROI:roi,inputForward,postAffine},
  referencePNG,
  ...(cropSupplied?{referenceMaskCrop}:{referenceMask}),
  blendMask:blendAtRoi.data,blendMaskStride:blendAtRoi.stride,
  secondaryTestMask:declaredEmpty?new Uint8Array(originalWidth*originalHeight):secondaryAtRoi.data,
  secondaryTestMaskStride:declaredEmpty?originalWidth:secondaryAtRoi.stride,
  secondaryTestMaskDeclaredEmpty:declaredEmpty,
  intensity,referenceRevision,
  ...(secondaryProtection!==undefined?{secondaryProtection,secondaryProtectionStride}:{}),
  ...(secondaryPreparation!==undefined?{secondaryPreparation}:{}),
  ...(secondaryPostBlend!==undefined?{secondaryPostBlend}:{}),
  ...(colorMapRequired===true?{colorMapRequired:true,colorMap}:{}),
 };
}
export {buildReferenceJobRequest};
