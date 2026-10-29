'use strict';
const F=Math.fround,floor64=v=>Math.floor(v/64)*64;

// 原1482a32b1..3351未锁定尺寸分支：Mat的宽/高上限分别1024/1408，先缩放再向下对齐64。
// 不能把float32改成double，或把向下取整改成向上；极窄区域可能得到零，调用者应跳过。
function chooseWhiteHairModelSize({width,height}){
 if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=0x7fffffff))throw new RangeError('去白发区域尺寸无效');
 const tw=width>=1024?1024:Math.max(768,floor64(width)),th=height>=1408?1408:Math.max(768,floor64(height));
 const fw=F(width),fh=F(height),scale=Math.min(F(tw/fw),F(th/fh));
 return [floor64(Math.trunc(F(fw*scale))),floor64(Math.trunc(F(fh*scale)))];
}
module.exports={chooseWhiteHairModelSize};
