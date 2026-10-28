'use strict';
const {resizeBytes}=require('../opencv-runtime.cjs');
const {prepareHairBaseImage,prepareHairDetailInput}=require('./prepare.cjs');
const {packPreparedHairInput}=require('./input.cjs');
const {decodePreparedHairOutput}=require('./output.cjs');
const {composeCachedHairRegion}=require('./cached-composite.cjs');

// 从已给定整数蒙版裁切框取出柔边蒙版；坐标转换及模型尺寸取整不在此猜测。
function cropModelMask(mask,rect,targetWH){
 if(!mask)throw new RangeError('头发模型蒙版缺失');
 const {data,width,height,stride=width}=mask;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width||data.length<(height-1)*stride+width)throw new RangeError('头发模型蒙版尺寸无效');
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[2]<1||rect[3]<1||rect[0]+rect[2]>width||rect[1]+rect[3]>height)throw new RangeError('头发蒙版裁切框无效');
 const [x,y,w,h]=rect,dataROI=new Uint8Array(w*h),[tw,th]=targetWH;
 for(let row=0;row<h;row++)dataROI.set(data.subarray((y+row)*stride+x,(y+row)*stride+x+w),row*w);
 return w===tw&&h===th?dataROI:resizeBytes({data:dataROI,width:w,height:h,channels:1,targetWidth:tw,targetHeight:th});
}

// 确认回传的是本次请求的模型网格，防止把其他图片/尺寸的缓存结果贴回当前区域。
function decodeExpected(output,kind,width,height){
 const channels=kind==='base'?4:2;
 if(!output||!Array.isArray(output.dims)||output.dims.length!==4||!output.dims.every((v,i)=>v===[1,channels,height,width][i]))throw new RangeError('头发 '+kind+' 模型输出尺寸与请求不一致');
 return decodePreparedHairOutput({data:output.data,dims:output.dims,kind}); // 推理库的data可能是原型访问器，不能用对象展开丢掉它。
}

// 串联已经准备好的图像、柔边蒙版、整数几何和两个张量供应器。
// 调用前初始化离线图像库；此入口尚未接入界面，不表示原分割或完整推理已等价。
async function processPreparedHair({image,width,height,channels=3,stride=width*channels,mask,geometry,infer,smoothStrength=1,detailStrength=1,branch='scalar',rounding='nearest-away'}){
 if(!geometry||typeof infer?.base!=='function'||typeof infer?.detail!=='function')throw new TypeError('缺少头发处理几何或模型供应器');
 if(![smoothStrength,detailStrength].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!['scalar','sse41'].includes(branch)||!['nearest-away','nearest-even'].includes(rounding))throw new RangeError('头发处理强度或分支无效');
 const {sourceRect,maskRect,baseWH,detailSide}=geometry;
 if(!Number.isSafeInteger(detailSide)||detailSide<1)throw new RangeError('头发细节模型尺寸无效');
 const baseImage=prepareHairBaseImage({image,width,height,channels,stride,rect:sourceRect,modelWH:baseWH});
 const baseMask=cropModelMask(mask,maskRect,baseWH),[bw,bh]=baseWH;
 // 1483f9c64：两项float32强度均严格小于0.001时不运行模型，保留完整源图。
 if(Math.fround(smoothStrength)<Math.fround(.001)&&Math.fround(detailStrength)<Math.fround(.001))return Uint8Array.from(image);
 const baseInput=packPreparedHairInput({...baseImage,mask:baseMask});
 const base=decodeExpected(await infer.base(baseInput),'base',bw,bh);
 const detailInput=prepareHairDetailInput({image:baseImage.pixels,...base,mask:baseMask,width:bw,height:bh,detailSide,branch});
 const {detail}=decodeExpected(await infer.detail(detailInput),'detail',detailSide,detailSide);
 const layer=(data,w,h)=>({data,width:w,height:h,rect:[0,0,w,h],canvasWH:[w,h]});
 return composeCachedHairRegion({image,channels,imageStride:stride,rect:sourceRect,smoothStrength,detailStrength,rounding,
  layers:{smooth:layer(base.smooth,bw,bh),alpha:layer(base.alpha,bw,bh),mask:layer(baseMask,bw,bh),detail:layer(detail,detailSide,detailSide)}});
}

module.exports={processPreparedHair};
