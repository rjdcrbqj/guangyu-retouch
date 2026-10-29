'use strict';
const {resizeBytes,scaleMaskBytes}=require('../opencv-runtime.cjs');
const {packPreparedHairInput}=require('../hair-smooth/input.cjs');
const {blendPreparedHairInput}=require('../hair-smooth/bridge.cjs');
const {decodePreparedWhiteHairOutput}=require('./output.cjs');
const F=Math.fround;

function plane({data,width,height,stride=width},channels,rect,minimum){
 if(![width,height,stride,width*height*channels].every(v=>Number.isSafeInteger(v)&&v>0)||stride<width*channels||!(data instanceof Uint8Array)||data.length<(height-1)*stride+width*channels)throw new RangeError('去白发图层尺寸或行距无效');
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[2]<minimum||rect[3]<minimum||rect[0]+rect[2]>width||rect[1]+rect[3]>height)throw new RangeError('去白发区域过小或越界');
 return {data,width,height,stride,channels,rect:[...rect]};
}
function cropResize({data,stride,channels,rect:[x,y,w,h]},mw,mh){
 const colors=channels===4?3:channels,packed=new Uint8Array(w*h*colors);
 for(let row=0;row<h;row++)for(let col=0;col<w;col++)for(let c=0;c<colors;c++)packed[(row*w+col)*colors+c]=data[(row+y)*stride+(col+x)*channels+c];
 return resizeBytes({data:packed,width:w,height:h,channels:colors,targetWidth:mw,targetHeight:mh});
}

// 已准备整数区域的完整串联。去白发直接缩放一次，不套用头发顺滑的预缩放规则。
// 原人物选区/尺寸调度尚未全部确认，geometry由上游提供；调用前初始化离线图像库。
async function processPreparedWhiteHair({image,width,height,channels=3,stride=width*channels,mask,geometry,infer,strength=1,branch='scalar'}){
 if(!geometry||!mask||typeof infer!=='function')throw new TypeError('缺少去白发区域、蒙版或模型供应器');
 if(![3,4].includes(channels)||!['scalar','sse41'].includes(branch)||branch==='sse41'&&channels!==3||!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('去白发通道、强度或混合分支无效');
 const source=plane({data:image,width,height,stride},channels,geometry.sourceRect,0),maskPlane=plane(mask,1,geometry.maskRect,1),modelWH=geometry.modelWH;
 if(!Array.isArray(modelWH)||modelWH.length!==2||!modelWH.every(v=>Number.isSafeInteger(v)&&v>0&&v<=0x3fffffff)||!Number.isSafeInteger(modelWH[0]*modelWH[1]*4))throw new RangeError('去白发模型尺寸无效');
 const [mw,mh]=modelWH,[x,y,rw,rh]=source.rect,output=Uint8Array.from(image);
 if(rw<3||rh<3||F(strength)<F(.001))return output; // 原14829eae0的小区域跳过与严格float32停用阈值。
 const pixels=cropResize(source,mw,mh),modelMask=cropResize(maskPlane,mw,mh),input=packPreparedHairInput({pixels,mask:modelMask,width:mw,height:mh});
 const tensor=await infer(input),expected=[1,4,mh,mw];
 if(!tensor||!Array.isArray(tensor.dims)||tensor.dims.length!==4||!tensor.dims.every((v,i)=>v===expected[i]))throw new RangeError('去白发模型输出尺寸与请求不符');
 const decoded=decodePreparedWhiteHairOutput({data:tensor.data,dims:tensor.dims,mask:{data:modelMask,width:mw,height:mh}});
 const repaired=resizeBytes({data:decoded.image,width:mw,height:mh,channels:3,targetWidth:rw,targetHeight:rh});
 const resizedAlpha=resizeBytes({data:decoded.alpha,width:mw,height:mh,channels:1,targetWidth:rw,targetHeight:rh});
 const alpha=scaleMaskBytes({data:resizedAlpha,width:rw,height:rh,strength});
 // 原1482a7290逐行调用混合器；SSE尾部必须在每行重新开始，不能跨行拼成一段。
 for(let row=0;row<rh;row++){
  const offset=(y+row)*stride+x*channels;
  const mixed=blendPreparedHairInput({image:output.subarray(offset,offset+rw*channels),smooth:repaired.subarray(row*rw*3,(row+1)*rw*3),alpha:alpha.subarray(row*rw,(row+1)*rw),width:rw,height:1,channels,branch});
  output.set(mixed,offset);
 }
 return output; // 保留源图、透明度、区域外像素及行尾填充。
}
module.exports={processPreparedWhiteHair};
