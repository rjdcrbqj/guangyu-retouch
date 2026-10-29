'use strict';
const {toothFrequencyDetailScore}=require('../opencv-runtime.cjs');
// 已裁剪质量检查区域的清晰度值；用于原参数阈值比较，非修复效果评分。
// 频域运算使用离线OpenCV浮点实现，独立版本对照允许小数值误差。
function scorePreparedToothRepairDetail({data,width,height,channels=1,stride=width*channels}){
 if(![1,3,4].includes(channels)||![width,height,stride,width*height*channels].every(v=>Number.isSafeInteger(v)&&v>0)||stride<width*channels||!(data instanceof Uint8Array)||data.length<(height-1)*stride+width*channels)throw new RangeError('牙齿清晰度图层尺寸、通道或行距无效');
 const packed=new Uint8Array(width*height*channels);for(let row=0;row<height;row++)packed.set(data.subarray(row*stride,row*stride+width*channels),row*width*channels);
 return toothFrequencyDetailScore({data:packed,width,height,channels});
}
module.exports={scorePreparedToothRepairDetail};
