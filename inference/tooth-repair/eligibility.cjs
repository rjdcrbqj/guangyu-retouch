'use strict';
const F=Math.fround;
const {selectPreparedToothLandmarks}=require('./geometry.cjs');
// 147fe07f8/147fe0808按原142点模板限制点数，辅助点不参与质量区域边界。
// 147fe0760：宽扩展1.25、高扩展1.5；横向居中，纵向向上扩展半个原高度。
function choosePreparedToothQualityRect({landmarks,width,height}){
 landmarks=selectPreparedToothLandmarks(landmarks);
 if(!(landmarks instanceof Float32Array)||landmarks.length<2||landmarks.length%2||!landmarks.every(Number.isFinite)||![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=2147483647))throw new RangeError('牙齿质量区域关键点或图像尺寸无效');
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let i=0;i<landmarks.length;i+=2){minX=Math.min(minX,landmarks[i]);maxX=Math.max(maxX,landmarks[i]);minY=Math.min(minY,landmarks[i+1]);maxY=Math.max(maxY,landmarks[i+1]);}
 const w=F(maxX-minX),h=F(maxY-minY),x=Math.trunc(w*(-.625)+F(minX+F(w*.5))),y=Math.trunc(F(F(minY+F(h*.5))-h)),rw=Math.trunc(F(w*1.25)),rh=Math.trunc(F(h*1.5));
 if(![x,y,rw,rh].every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647))throw new RangeError('牙齿质量区域超出整数范围');
 const left=Math.max(0,x),top=Math.max(0,y),right=Math.min(width,x+rw),bottom=Math.min(height,y+rh);
 return right>left&&bottom>top?[left,top,right-left,bottom-top]:[0,0,0,0];
}
// 默认值来自147cdf4e0显式初始化，并经147ce15e0复制到ToothParams+30。
// alignedLandmarks已按有效模型ROI宽度对齐到512；原每人物旁路位可跳过资格检查。
function isPreparedToothRepairEligible({alignedLandmarks,qualityRect,detailScore,minimumOpening=20,minimumRegionSize=200,checkQuality=true,minimumDetail=F(1.7),bypass=false}){
 if(typeof bypass!=='boolean')throw new RangeError('牙齿旁路参数无效');if(bypass)return true;
 alignedLandmarks=selectPreparedToothLandmarks(alignedLandmarks);
 if(!(alignedLandmarks instanceof Float32Array)||alignedLandmarks.length<210||alignedLandmarks.length%2||!alignedLandmarks.every(Number.isFinite)||!Array.isArray(qualityRect)||qualityRect.length!==4||!qualityRect.every(v=>Number.isSafeInteger(v)&&v>=0)||typeof checkQuality!=='boolean'||!Number.isFinite(F(minimumOpening))||minimumOpening<0||!Number.isInteger(minimumRegionSize)||minimumRegionSize<0||minimumRegionSize>2147483647||!Number.isFinite(F(minimumDetail)))throw new RangeError('牙齿资格关键点、区域或阈值无效');
 const dx=F(alignedLandmarks[196]-alignedLandmarks[208]),dy=F(alignedLandmarks[197]-alignedLandmarks[209]),opening=F(Math.sqrt(F(F(dx*dx)+F(dy*dy)))),minimumSize=Math.trunc(F(minimumRegionSize));
 if(opening<F(minimumOpening)||qualityRect[2]<minimumSize||qualityRect[3]<minimumSize)return false;
 if(!checkQuality)return true;
 if(!Number.isFinite(F(detailScore)))throw new RangeError('牙齿清晰度值无效');
 return F(detailScore)>=F(minimumDetail);
}
module.exports={choosePreparedToothQualityRect,isPreparedToothRepairEligible};
