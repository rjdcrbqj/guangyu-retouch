'use strict';
const dimension=n=>Number.isInteger(n)&&n>=1&&n<=32766;

// 验证明确供应的物理BYTE平面；只要求最后一行的有效像素，不读取padding。
function suppliedPlane(frame,channels,maximum){
 if(!frame||!dimension(frame.width)||!dimension(frame.height)||frame.width>maximum||frame.height>maximum||frame.width*frame.height>80000000)
  throw RangeError('取色资格平面尺寸无效');
 const {data,width,height,stride}=frame,last=(height-1)*stride+width*channels;
 if(!(data instanceof Uint8Array)||!Number.isSafeInteger(stride)||stride<width*channels||
  !Number.isSafeInteger(last)||data.length<last||
  (channels===4?frame.channels!==4:frame.channels!==undefined&&frame.channels!==1))
  throw TypeError('取色资格需要明确BYTE布局及有效stride');
 return {data,width,height,stride};
}

// 统计非零数量而非BYTE总量；DOUBLE比较保留恰好30%的接受边界。
function coverage(frame,x,y,width,height,channels){
 let count=0;
 for(let row=y;row<y+height;row++)for(let col=x;col<x+width;col++)
  if(frame.data[row*frame.stride+col*channels]!==0)count++;
 const area=width*height,ratio=count/area;
 return {eligible:ratio>=.3,count,area,coverage:ratio};
}

// CPU资格检查：调用方必须提供已完成真实类别组合的聚合掩码，不从照片生成它。
function evaluateSuppliedPickerCoverage({sourceWH,point,aggregateMask}={}){
 if(!Array.isArray(sourceWH)||sourceWH.length!==2||!Array.from(sourceWH).every(dimension)||sourceWH[0]*sourceWH[1]>80000000)
  throw RangeError('取色资格照片尺寸无效');
 if(!(Array.isArray(point)||point instanceof Int32Array)||point.length!==2||
  !Array.from(point).every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647))
  throw TypeError('取色资格需要两个有符号整数坐标');
 if(!aggregateMask)throw TypeError('取色资格缺少真实聚合掩码');
 const mask=suppliedPlane(aggregateMask,1,32766),[sw,sh]=sourceWH,[px,py]=point;
 if(px<=0||py<=0||px>=sw||py>=sh)
  return {eligible:false,sourceROI:null,maskROI:null,count:0,area:0,coverage:null};
 const x=Math.max(0,px-32),y=Math.max(0,py-32),w=Math.min(64,sw-x),h=Math.min(64,sh-y);
 // 正整数域内按原IDIV起点向零、终点上取整；所有乘积在已限定INT32范围内。
 const left=Math.trunc(mask.width*x/sw),top=Math.trunc(mask.height*y/sh);
 const right=Math.min(mask.width,Math.trunc((mask.width*(x+w)+sw-1)/sw));
 const bottom=Math.min(mask.height,Math.trunc((mask.height*(y+h)+sh-1)/sh));
 return {...coverage(mask,left,top,right-left,bottom-top,1),sourceROI:Int32Array.from([x,y,w,h]),maskROI:Int32Array.from([left,top,right-left,bottom-top])};
}

// 回读资格检查：四个物理BYTE中仅第0个参与，不使用其它颜色分量或alpha代替。
function evaluateSuppliedPickerReadback(frame){
 const data=suppliedPlane(frame,4,64);
 return coverage(data,0,0,data.width,data.height,4);
}

module.exports={evaluateSuppliedPickerCoverage,evaluateSuppliedPickerReadback};
