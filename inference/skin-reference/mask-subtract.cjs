'use strict';
function validate(mask){
 if(!mask||!(mask.data instanceof Uint8Array))throw TypeError('参考mask减法需要BYTE1供给');
 const {width,height,stride,data}=mask;
 if(![width,height].every(v=>Number.isInteger(v)&&v>=1&&v<=32766)||width*height>80000000)
  throw RangeError('参考mask减法WH超出供给范围');
 const span=(height-1)*stride+width;
 if(!Number.isSafeInteger(stride)||stride<width||!Number.isSafeInteger(span)||data.length<span)
  throw RangeError('参考mask减法stride或最后有效行范围无效');
}
function subtractSuppliedReferenceMasks(request){
 if(!request||request.math!=='native-u8-saturating-subtract-generic')throw TypeError('参考mask减法需要明确generic数学声明');
 const {left,right}=request;validate(left);validate(right);
 const {width,height}=left;
 if(right.width!==width||right.height!==height)throw RangeError('参考mask减法需要相同WH');
 const data=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)
  data[y*width+x]=Math.max(0,left.data[y*left.stride+x]-right.data[y*right.stride+x]);
 return {data,width,height,stride:width};
}
module.exports={subtractSuppliedReferenceMasks};
