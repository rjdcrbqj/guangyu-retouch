'use strict';
const {prepareReferenceHeads,applyReferenceRows}=require('./output-row.cjs');
const {blendReferenceROI}=require('./final-blend.cjs');

// 明确供应geometry和两类蒙版，完整provider与NN由后续服务负责。
function applySuppliedReferenceResult(r){
 if(!r||r.geometry?.valid!==true||!(r.geometry.originalROI instanceof Int32Array)||r.geometry.originalROI.length!==4)throw TypeError('参考图结果缺少有效几何');
 const ROI=Array.from(r.geometry.originalROI),work=prepareReferenceHeads(r.heads);
 const processed=applyReferenceRows({source:r.source,width:r.width,height:r.height,stride:r.stride,channels:r.channels,ROI,
  postAffine:r.geometry.postAffine,pixelMask:r.pixelMask,maskStride:r.pixelMaskStride,work,startRow:r.startRow,endRow:r.endRow});
 const output=blendReferenceROI({source:r.source,width:r.width,height:r.height,stride:r.stride,channels:r.channels,ROI,
  processed:processed.processed,processedStride:processed.stride,mask:r.finalMask,maskStride:r.finalMaskStride,intensity:r.intensity,startRow:r.startRow,endRow:r.endRow});
 const [x,y,w,h]=ROI;let changedRGBFields=0;
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  const at=(y+row)*r.stride+(x+col)*r.channels;
  for(let c=0;c<3;c++)if(output[at+c]!==r.source[at+c])changedRGBFields++;
 }
 return {output,ROI,changedRGBFields};
}
module.exports={applySuppliedReferenceResult};
