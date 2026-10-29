'use strict';
const F=Math.fround,THRESHOLD=F(.0001),CROP_FRACTION=F(.9);
function tensor(t,channels){
 if(!t||!(t.data instanceof Float32Array)||!Array.isArray(t.dims)||t.dims.length!==4||t.dims[0]!==1||t.dims[1]!==channels)throw new RangeError('牙齿模型输出类型或通道不符');
 const [h,w]=t.dims.slice(2),n=w*h;
 if(![w,h,n,n*channels].every(v=>Number.isSafeInteger(v)&&v>0)||t.data.length!==n*channels||!t.data.every(Number.isFinite))throw new RangeError('牙齿模型输出尺寸、长度或浮点值无效');
 return [w,h,n];
}
function byte(value){
 if(value>=2147483648||value< -2147483648)return 0;
 const lower=Math.floor(value),fraction=value-lower,rounded=fraction>.5||fraction===.5&&lower%2!==0?lower+1:lower;
 return Math.max(0,Math.min(255,rounded));
}
// 147fe9210取alpha严格大于0.0001的包围框；面积不足画布90%才缩小缓存。
// 147fe93f0按默认MXCSR取偶并饱和RGB，alpha原样保留float32；模型RGB已是0..255。
function decodePreparedToothRepairOutput({image,alpha}){
 const [w,h,n]=tensor(image,3),[aw,ah]=tensor(alpha,1);if(w!==aw||h!==ah)throw new RangeError('牙齿模型输出网格不一致');
 let left=w,top=h,right=-1,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alpha.data[y*w+x]>THRESHOLD){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 let cropRect=[0,0,w,h];
 if(right>=left&&bottom>=top){const cw=right-left+1,ch=bottom-top+1;if(F(cw*ch)<F(F(n)*CROP_FRACTION))cropRect=[left,top,cw,ch];}
 const [x,y,width,height]=cropRect,colors=new Uint8Array(width*height*3),opacity=new Float32Array(width*height);
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){const source=(row+y)*w+col+x,target=row*width+col;for(let c=0;c<3;c++)colors[target*3+c]=byte(image.data[c*n+source]);opacity[target]=alpha.data[source];}
 return {image:colors,alpha:opacity,width,height,cropRect,canvasWH:[w,h]};
}
module.exports={decodePreparedToothRepairOutput};
