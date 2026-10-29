'use strict';
const F=Math.fround,SCALE=F(1/127.5);

// 147fdb400的已准备输入：RGB平面归一化；第二输入逐行复制float32，不另作缩放。
// 这里只接收已准备的图像与辅助图层；嘴部选区及辅助图层生成尚未全部确认。
function packPreparedToothRepairInputs({pixels,width,height,channels=3,stride=width*channels,auxiliary}){
 if(![3,4].includes(channels)||![width,height,stride,width*height*3].every(v=>Number.isSafeInteger(v)&&v>0)||stride<width*channels||!(pixels instanceof Uint8Array)||pixels.length<(height-1)*stride+width*channels)throw new RangeError('牙齿图层尺寸、通道或行距无效');
 if(!auxiliary)throw new RangeError('缺少牙齿辅助图层');
 const {data:aux,width:aw,height:ah,stride:ast=aw}=auxiliary;
 if(![aw,ah,ast,aw*ah].every(v=>Number.isSafeInteger(v)&&v>0)||ast<aw||!(aux instanceof Float32Array)||aux.length<(ah-1)*ast+aw)throw new RangeError('牙齿辅助图层尺寸、类型或行距无效');
 const count=width*height,image=new Float32Array(count*3),preparedAux=new Float32Array(aw*ah);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)image[c*count+y*width+x]=F(F(pixels[y*stride+x*channels+c]-127.5)*SCALE);
 for(let y=0;y<ah;y++)for(let x=0;x<aw;x++){const value=aux[y*ast+x];if(!Number.isFinite(value))throw new RangeError('牙齿辅助图层包含非有限值');preparedAux[y*aw+x]=value;}
 return {image:{data:image,dims:[1,3,height,width]},auxiliary:{data:preparedAux,dims:[1,1,ah,aw]}};
}
module.exports={packPreparedToothRepairInputs};
