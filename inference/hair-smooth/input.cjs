'use strict';
const F=Math.fround,SCALE=F(1/127.5);

// 接收已按模型通道顺序排列的图层；裁剪、工作图颜色转换需由上游完成。
// 原三色打包/归一化路径：14553a190、14553b590、1434c40d0；蒙版：14553a5b0。
function packPreparedHairInput({pixels,mask,width,height,channels=3,stride=width*channels,maskStride=width}){
 if(![3,4].includes(channels))throw new RangeError('头发输入需要三色或四色图层');
 if(![width,height].every(value=>Number.isSafeInteger(value)&&value>0))throw new RangeError('头发输入宽高无效');
 if(!(pixels instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width*channels||pixels.length<(height-1)*stride+width*channels)throw new RangeError('头发图层长度或行距不足');
 if(!(mask instanceof Uint8Array)||!Number.isSafeInteger(maskStride)||maskStride<width||mask.length<(height-1)*maskStride+width)throw new RangeError('头发蒙版长度或行距不足');
 const plane=width*height,data=new Float32Array(plane*4);
 for(let row=0;row<height;row++)for(let column=0;column<width;column++){
  const source=row*stride+column*channels,target=row*width+column;
  for(let channel=0;channel<3;channel++)data[channel*plane+target]=F(F(pixels[source+channel]-127.5)*SCALE);
  data[3*plane+target]=mask[row*maskStride+column]; // 保留原值0–255，不能除以255。
 }
 return {data,dims:[1,4,height,width]};
}

module.exports={packPreparedHairInput};
