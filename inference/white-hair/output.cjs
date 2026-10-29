'use strict';
const {decodePreparedHairOutput}=require('../hair-smooth/output.cjs');
const {prepareWhiteHairSoftMask}=require('./mask.cjs');
const {gateFloatAlphaBytes}=require('../opencv-runtime.cjs');
const F=Math.fround;

// 原14829f0b0的float输出分支：RGB与头发模型共享归一化/取整规则，第四平面延后量化。
// 当前只复原已准备区域的后处理；人物定位、模型资源与完整界面接入不在此函数中。
function decodePreparedWhiteHairOutput({data,dims,mask}){
 if(!mask||mask.width!==dims?.[3]||mask.height!==dims?.[2])throw new RangeError('去白发输出与蒙版尺寸不符');
 const {smooth:image}=decodePreparedHairOutput({data,dims,kind:'base'});
 const height=dims[2],width=dims[3],count=width*height,alpha=new Float32Array(count);
 for(let i=0;i<count;i++)alpha[i]=F(F(data[count*3+i]+1)*127.5);
 const softened=prepareWhiteHairSoftMask(mask);
 return {image,alpha:gateFloatAlphaBytes({alpha,mask:softened.data,width,height}),width,height};
}
module.exports={decodePreparedWhiteHairOutput};
