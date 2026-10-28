'use strict';
const {referenceMaskPatchROI}=require('./mask.cjs');
const {resizeReferenceMono64}=require('./mono64.cjs');

// 只裁剪明确供给的companion mask；照片使用自身独立输入。
function prepareSuppliedReferenceMask64({mask,ratios,currentPhotoWH,math}={}){
 if(!mask||![mask.width,mask.height].every(v=>Number.isInteger(v)&&v>=1&&v<=32766)||mask.width*mask.height>80000000)
  throw RangeError('参考蒙版64供给尺寸无效');
 const {data,width,height,stride}=mask,last=(height-1)*stride+width;
 if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width||!Number.isSafeInteger(last)||data.length<last||math!=='native-code2-scalar')
  throw TypeError('参考蒙版64布局/标量数学声明无效');
 const {ROI,valid}=referenceMaskPatchROI({ratios,currentPhotoWH,maskWH:[width,height]});
 if(!valid)return {valid:false,ROI,mask:null};
 const [x,y,w,h]=ROI,crop=new Uint8Array(w*h);
 for(let row=0;row<h;row++)crop.set(data.subarray((y+row)*stride+x,(y+row)*stride+x+w),row*w);
 const result=resizeReferenceMono64({data:crop,width:w,height:h,stride:w,math});
 return {valid:true,ROI,mask:result};
}
module.exports={prepareSuppliedReferenceMask64};
