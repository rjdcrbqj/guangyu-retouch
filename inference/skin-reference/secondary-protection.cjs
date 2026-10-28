'use strict';
const {blurSmallSuppliedProtection}=require('./small-protection.cjs');
const {multiplySuppliedMasks}=require('./mask.cjs');
const f=Math.fround;

// 灰度/LUT、histogram真实初始化及工作图resize均由caller供应；固定flags5无尾子集。
function prepareSuppliedSecondaryProtectionMasks(r){
 if(!r||r.math!=='native-byte1-packed-no-tail-histogram-supplied')throw TypeError('二次保护需要明确供给数学域');
 const {width,height,highFraction,lowFraction}=r,area=width*height;
 // callback先按行range裁子Mat，再折叠；每行16对齐才保证任意行块均无尾。
 if(![width,height].every(v=>Number.isInteger(v)&&v>=11&&v<=512)||width%16!==0)throw RangeError('二次保护需要11..512 packed且每行16对齐的无尾工作图');
 if(![highFraction,lowFraction].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))throw TypeError('二次保护比例需明确有限0..1');
 if(!(r.histogram instanceof Float32Array)||r.histogram.length!==256)throw TypeError('二次保护需实际256项F32计数');
 const histogram=new Float32Array(r.histogram);
 let count=0;
 for(const value of histogram){
  if(!Number.isInteger(value)||value<0||value>area)throw RangeError('二次保护histogram计数无效');
  count+=value;
 }
 if(count>area)throw RangeError('二次保护histogram总数超出整图面积');
 const highTarget=f(f(area)*f(highFraction)),lowTarget=f(f(area)*f(lowFraction));
 let high=255,low=0,sum=f(0);
 for(let i=255;i>=0;i--){sum=f(sum+histogram[i]);if(sum>=highTarget){high=i;break;}}
 sum=f(0);
 for(let i=0;i<256;i++){sum=f(sum+histogram[i]);if(sum>=lowTarget){low=i;break;}}
 const cutoffs={high,low};
 // 原wrapper的范围外constant-fill尚未核实，不返回伪造的极值结果。
 if(high===0||low===255)return {available:false,reason:'unresolved-threshold-fill',cutoffs,highTarget,lowTarget,high:null,derivedLow:null,auxiliary:null};
 const {lookupGray,inputMask}=r;
 if(!(lookupGray instanceof Uint8Array)||!(inputMask instanceof Uint8Array)||lookupGray.length!==area||inputMask.length!==area)throw TypeError('二次保护需同尺寸packed BYTE1平面');
 const gray=new Uint8Array(lookupGray),mask=new Uint8Array(inputMask),hi=new Uint8Array(area),lo=new Uint8Array(area);
 for(let i=0;i<area;i++){
  hi[i]=gray[i]>=high?255:0;
  lo[i]=gray[i]<=low&&mask[i]<=127?255:0;
 }
 const highBlur=blurSmallSuppliedProtection({data:hi,width,height,stride:width,requestedRadius:30});
 const lowBlur=blurSmallSuppliedProtection({data:lo,width,height,stride:width,requestedRadius:30});
 function multiply(blur){return {data:multiplySuppliedMasks({baseMask:blur.mask,selectionMask:mask,width,height,baseStride:width,selectionStride:width}),width,height,stride:width};}
 return {available:true,cutoffs,highTarget,lowTarget,effectiveRadius:highBlur.effectiveRadius,
  high:multiply(highBlur),derivedLow:multiply(lowBlur),auxiliary:null};
}
module.exports={prepareSuppliedSecondaryProtectionMasks};
