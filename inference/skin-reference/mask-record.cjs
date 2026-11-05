'use strict';
const MATH='native-u8-roi-copy';
const dimension=n=>Number.isInteger(n)&&n>=1&&n<=32766;
function checkMath(math){if(math!==MATH)throw TypeError('蒙版记录需要明确BYTE1原点复制声明');}

// 仅接收已解码BYTE1。fullWH、原点和局部image彼此独立；不推断模型类别或PNG身份。
// 143620a90(mode0) →1401de110 →140988910的有效、界内ROI复制分支。
function materializeSuppliedReferenceMask({record,math}={}){
 checkMath(math);
 if(record==null||record.image==null)return null;
 const image=record.image;
 if(Number.isInteger(image.width)&&image.width<=0||Number.isInteger(image.height)&&image.height<=0)return null;
 const {fullWH,origin}=record,{data,width,height,stride,channels}=image;
 if(!Array.isArray(fullWH)||fullWH.length!==2||!fullWH.every(dimension)||fullWH[0]*fullWH[1]>80000000||
  !Array.isArray(origin)||origin.length!==2||!origin.every(Number.isInteger)||!dimension(width)||!dimension(height))
  throw RangeError('蒙版记录需要有效fullWH、整数原点和局部尺寸');
 if(!(data instanceof Uint8Array)||(channels!==undefined&&channels!==1)||!Number.isSafeInteger(stride)||stride<width||
  !Number.isSafeInteger((height-1)*stride+width)||data.length<(height-1)*stride+width)
  throw TypeError('蒙版记录只支持已供应BYTE1与有效行stride');
 const [w,h]=fullWH,[x,y]=origin;
 if(x<0||y<0||x+width>w||y+height>h)throw RangeError('蒙版记录ROI超出完整画布');
 const out=new Uint8Array(w*h);
 for(let row=0;row<height;row++)out.set(data.subarray(row*stride,row*stride+width),(y+row)*w+x);
 return {data:out,width:w,height:h,stride:w};
}

// 已缓存的人脸结果之外，143620a90的实际selector[0]/mode0 miss选路。
// typed键存在但无效时保持不可用；只有键缺失才能读取faceID→ordinal供给。
function selectSuppliedReferenceMask(request={}){
 const {typedMasks,math}=request;checkMath(math);
 if(!(typedMasks instanceof Map))throw TypeError('蒙版类型供给需要保留键存在性的Map');
 if(typedMasks.has(0))return materializeSuppliedReferenceMask({record:typedMasks.get(0),math});
 const {faceId,faceOrdinals,instanceMasks}=request;
 if(!Number.isInteger(faceId)||faceId<-2147483648||faceId>2147483647||!(faceOrdinals instanceof Map)||!Array.isArray(instanceMasks))
  throw TypeError('实例选路需要有符号faceID、ordinal Map和实例vector');
 if(!faceOrdinals.has(faceId))return null;
 const ordinal=faceOrdinals.get(faceId);
 if(!Number.isSafeInteger(ordinal)||ordinal<0||ordinal>=instanceMasks.length)return null;
 return materializeSuppliedReferenceMask({record:instanceMasks[ordinal],math});
}
module.exports={materializeSuppliedReferenceMask,selectSuppliedReferenceMask};
