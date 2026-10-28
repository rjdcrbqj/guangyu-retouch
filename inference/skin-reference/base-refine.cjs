'use strict';
const {applyReferenceBaseLUT}=require('./base-lut.cjs');
const {dilateReferenceMask}=require('./dilate.cjs');
const {guidedRefineBYTE3}=require('./guided.cjs');
const {bilateralSuppliedWeights}=require('./bilateral.cjs');

// 真实crop clone之后的五步细化；所有像素与双边权重都由调用方明确供给。
function refineSuppliedReferenceBaseROI({guide,mask,width,height,radius,range,spatial,rounding}={}){
 if(rounding!=='nearest-even'||![width,height].every(v=>Number.isInteger(v)&&v>=5&&v<=1500)||
  !Number.isInteger(radius)||radius<1||radius>15||!(guide instanceof Uint8Array)||guide.length!==width*height*3||
  !(mask instanceof Uint8Array)||mask.length!==width*height)throw TypeError('base ROI需要packed BYTE3/mono、有效WH/radius和显式nearest-even');
 const bilateralRadius=Math.max(4,radius)>>2,count=[0,5,13,29][bilateralRadius];
 if(!(range instanceof Float32Array)||range.length!==256||!(spatial instanceof Float32Array)||spatial.length!==count||
  range[0]!==1||spatial[count>>1]!==1||![range,spatial].every(a=>a.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw TypeError('base ROI缺少对应q组的显式有效双边表');
 const prepared=applyReferenceBaseLUT({data:mask,width,height,stride:width,stage:'prepare'}).mask;
 const dilated=dilateReferenceMask({data:prepared,width,height,rounding});
 const refined=guidedRefineBYTE3({guide,source:dilated,width,height,radius,rounding});
 const softened=bilateralSuppliedWeights({data:refined,width,height,radius:bilateralRadius,range,spatial,rounding});
 return applyReferenceBaseLUT({data:softened,width,height,stride:width,stage:'finish'}).mask; // finish在bilateral之后，保留独立BYTE阶段。
}
module.exports={refineSuppliedReferenceBaseROI};
