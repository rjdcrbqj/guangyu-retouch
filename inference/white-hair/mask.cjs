'use strict';
const {resizeBytes,expandAndBlurMaskBytes}=require('../opencv-runtime.cjs');

// 原14829f0b0：正尺寸向上取整到1/4；15×15椭圆膨胀、13×13均值模糊，再线性放回。
// 膨胀使用常量中性边界；模糊明确使用BORDER_REFLECT(2)，不是默认REFLECT_101。
function prepareWhiteHairSoftMask({data,width,height,stride=width}){
 if(![width,height,stride,width*height,stride*height].every(v=>Number.isSafeInteger(v)&&v>0)||stride<width||!(data instanceof Uint8Array)||data.length<(height-1)*stride+width)throw new RangeError('去白发蒙版尺寸或数据无效');
 const packed=new Uint8Array(width*height);
 for(let y=0;y<height;y++)packed.set(data.subarray(y*stride,y*stride+width),y*width);
 const smallWidth=Math.max(1,Math.ceil(width/4)),smallHeight=Math.max(1,Math.ceil(height/4));
 const small=resizeBytes({data:packed,width,height,channels:1,targetWidth:smallWidth,targetHeight:smallHeight});
 const softened=expandAndBlurMaskBytes({data:small,width:smallWidth,height:smallHeight,expandSize:15,blurSize:13});
 return {data:resizeBytes({data:softened,width:smallWidth,height:smallHeight,channels:1,targetWidth:width,targetHeight:height}),width,height};
}
module.exports={prepareWhiteHairSoftMask};
