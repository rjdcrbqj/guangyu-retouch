"use strict";
// 以原图眼区的实际明暗核对轮廓，拒绝没有可辨眼白/虹膜的暗区与平坦遮挡。
function eyeVisibility(side,rgb){
 const mask=Buffer.from(side.rgbaBase64,'base64'),count=side.maskWidth*side.maskHeight;
 if(!(rgb instanceof Uint8Array)||rgb.length!==count*3||mask.length!==count*4)throw Error('眼部可见性采样无效');
 const white=[],iris=[],all=[];
 for(let i=0;i<count;i++){const l=(rgb[i*3]*.2126+rgb[i*3+1]*.7152+rgb[i*3+2]*.0722)/255;if(mask[i*4]>127)white.push(l);if(mask[i*4+1]>127)iris.push(l);if(mask[i*4]+mask[i*4+1]>127)all.push(l);}
 const percentile=(a,p)=>{a.sort((x,y)=>x-y);return a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*p))]:0;};
 const whiteLevel=percentile(white,.75),irisLevel=percentile(iris,.5),contrast=percentile(all,.9)-percentile(all,.1);
 return {visible:white.length>=3&&iris.length>=3&&whiteLevel>.15&&whiteLevel-irisLevel>.035&&contrast>.08,whiteLevel,irisLevel,contrast};
}
module.exports={eyeVisibility};
