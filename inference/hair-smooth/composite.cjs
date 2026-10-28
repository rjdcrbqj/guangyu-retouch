'use strict';
const F=Math.fround;
const INV255=F(1/255),DETAIL_GAIN=F(0.8);

// 复原已对齐图层的合成：标量半整数远离零，SSE/AVX在已验证MXCSR下取偶。
// 此模块尚未接入界面，不声明模型推理或整项功能与原版等价。
function composePreparedHairRegion(input){
 const {image,mask,alpha,smooth,detail,width,height,x=0,y=0,channels,imageStride,maskStride,alphaStride,smoothStride,detailStride,smoothStrength=1,detailStrength=1,rounding='nearest-away'}=input;
 if(!['nearest-away','nearest-even'].includes(rounding))throw new RangeError('不支持的合成取整方式');
 if(![3,4].includes(channels))throw new TypeError('头发合成只支持RGB或RGBA');
 if(![width,height,x,y].every(value=>Number.isSafeInteger(value)&&value>=0))throw new RangeError('头发区域必须是非负整数');
 for(const [name,plane,stride,rowBytes,rows] of [
  ['image',image,imageStride,(x+width)*channels,y+height],
  ['mask',mask,maskStride,width,height],['alpha',alpha,alphaStride,width,height],
  ['smooth',smooth,smoothStride,width*3,height],['detail',detail,detailStride,width,height]
 ]){
  if(!(plane instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<rowBytes||plane.length<(rows?((rows-1)*stride+rowBytes):0))throw new RangeError(name+' 图层长度或行距不足');
 }
 if(![smoothStrength,detailStrength].every(value=>Number.isFinite(value)&&value>=0&&value<=1))throw new RangeError('合成强度必须在0至1之间');
 const output=Uint8Array.from(image),smoothAmount=F(smoothStrength),detailAmount=F(detailStrength);
 for(let row=0;row<height;row++)for(let column=0;column<width;column++){
  const rawMask=mask[row*maskStride+column];if(!rawMask)continue;
  const gate=F(rawMask*INV255);
  const weight=F(F(F(alpha[row*alphaStride+column]*INV255)*smoothAmount)*gate);
  const gain=F(F(gate*detailAmount)*DETAIL_GAIN);
  const residual=F(F(F(detail[row*detailStride+column]-127.5)*4)*gain);
  const destination=(row+y)*imageStride+(column+x)*channels;
  for(let channel=0;channel<3;channel++){
   let value=output[destination+channel];
   if(weight>0)value=F(F(value*F(1-weight))+F(smooth[row*smoothStride+column*3+channel]*weight));
   value=F(value+residual);
   let rounded;
   if(rounding==='nearest-even'){
    const lower=Math.floor(value),fraction=value-lower;
    rounded=fraction>0.5||fraction===0.5&&lower%2!==0?lower+1:lower;
   }else rounded=Math.trunc(F(value+(value>=0?0.5:-0.5)));
   output[destination+channel]=Math.max(0,Math.min(255,rounded));
  }
 }
 return output; // 只修改RGB，保留透明度、区域外像素及行尾填充。
}

module.exports={composePreparedHairRegion};
