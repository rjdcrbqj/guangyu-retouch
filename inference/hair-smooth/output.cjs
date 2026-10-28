'use strict';
const F=Math.fround;

// 复原float输出分支的CHW布局及字节转换；依据原调用链和CVTPS2DQ/CVTSS2SI指令。
// 取整约定为默认MXCSR 0x1f80；尚未对原Mat转换包装器作整体运行比对。
function decodePreparedHairOutput({data,dims,kind}){
 if(!(data instanceof Float32Array))throw new TypeError('头发模型输出必须是Float32Array');
 const channels=kind==='base'?4:kind==='detail'?2:0;
 if(!channels||!Array.isArray(dims)||dims.length!==4||dims[0]!==1||dims[1]!==channels)throw new RangeError('头发模型输出通道或批次不符');
 const height=dims[2],width=dims[3],count=width*height;
 if(![width,height,count,count*channels].every(value=>Number.isSafeInteger(value)&&value>0)||data.length!==count*channels)throw new RangeError('头发模型输出尺寸或长度不符');
 const planes=kind==='base'?4:1,bytes=new Uint8Array(count*planes);
 for(let i=0;i<bytes.length;i++){
  if(!Number.isFinite(data[i]))throw new RangeError('头发模型输出包含非有限值');
  const value=F(F(data[i]+1)*127.5),lower=Math.floor(value),fraction=value-lower;
  const rounded=fraction>0.5||fraction===0.5&&lower%2!==0?lower+1:lower;
  bytes[i]=value>=2147483648||value< -2147483648?0:Math.max(0,Math.min(255,rounded));
 }
 if(kind==='detail')return {detail:bytes}; // 原细节路径只读取第一平面。
 const smooth=new Uint8Array(count*3);
 for(let i=0;i<count;i++)for(let channel=0;channel<3;channel++)smooth[i*3+channel]=bytes[channel*count+i];
 return {smooth,alpha:bytes.slice(count*3)};
}

module.exports={decodePreparedHairOutput};
