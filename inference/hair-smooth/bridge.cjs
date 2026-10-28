'use strict';
const F=Math.fround;
const SCALAR_SCALE=0.0039215686,SSE_SCALE=0.003921568393707275;

// 将已对齐的基础RGB结果混入细节模型的输入；三张图均须连续且采用相同通道顺序。
// 仅复原已验证的像素步骤，模型调度、区域缩放及界面接入另行处理。
function blendPreparedHairInput({image,smooth,alpha,width,height,channels=3,branch='scalar'}){
 if(![3,4].includes(channels))throw new RangeError('头发输入混合只支持RGB或RGBA');
 if(!['scalar','sse41'].includes(branch)||branch==='sse41'&&channels!==3)throw new RangeError('未复原此加速分支与通道组合');
 const count=width*height;
 if(![width,height,count,count*channels].every(value=>Number.isSafeInteger(value)&&value>=0))throw new RangeError('头发输入尺寸必须是有效非负整数');
 for(const [name,plane,length] of [['image',image,count*channels],['smooth',smooth,count*3],['alpha',alpha,count]]){
  if(!(plane instanceof Uint8Array)||plane.length<length)throw new RangeError(name+' 图层长度不足');
 }
 const output=Uint8Array.from(image),vectorCount=branch==='sse41'?Math.floor(count/8)*8:0;
 for(let i=0;i<count;i++){
  const vector=i<vectorCount,weight=F(alpha[i]*(vector?SSE_SCALE:SCALAR_SCALE));
  if(!vector&&alpha[i]===0)continue;
  for(let channel=0;channel<3;channel++){
   const offset=i*channels+channel,old=image[offset];
   const value=F(F(F(smooth[i*3+channel]*weight)-F(old*weight))+old);
   output[offset]=vector?Math.max(0,Math.min(255,Math.floor(value))):Math.trunc(value)&255;
  }
 }
 return output; // 保留原输入、RGBA透明度及有效区域后的数据。
}

module.exports={blendPreparedHairInput};
