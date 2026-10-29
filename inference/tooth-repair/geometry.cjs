'use strict';
const F=Math.fround,int32=v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;
// 144e7e900构造142×2原模板；147fe0760与147fdb400均取min(实际点数,142)。
function selectPreparedToothLandmarks(landmarks){
 if(!(landmarks instanceof Float32Array)||landmarks.length<2||landmarks.length%2)throw new RangeError('牙齿关键点数量或类型无效');
 const selected=landmarks.slice(0,284);if(!selected.every(Number.isFinite))throw new RangeError('牙齿已选关键点坐标无效');return selected;
}
// 147fdb400先限制整数原点，再限制宽高；负原点不按普通矩形交集缩小尺寸。
// 输入为上游已经取整的ROI，不代替147fe2e90尚未确认的原始ROI取整调用。
function clipPreparedToothRect({rect,width,height}){
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(int32)||![width,height].every(v=>int32(v)&&v>0))throw new RangeError('牙齿整数区域或图像尺寸无效');
 const x=Math.min(width,Math.max(0,rect[0])),y=Math.min(height,Math.max(0,rect[1]));return [x,y,Math.max(0,Math.min(rect[2],width-x)),Math.max(0,Math.min(rect[3],height-y))];
}
function alignPreparedToothLandmarks({landmarks,rect}){
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>int32(v)&&v>=0)||rect[2]===0||rect[3]===0)throw new RangeError('牙齿对齐区域无效');
 const selected=selectPreparedToothLandmarks(landmarks),scale=F(512/F(rect[2]));
 for(let i=0;i<selected.length;i+=2){selected[i]=F(F(selected[i]-F(rect[0]))*scale);selected[i+1]=F(F(selected[i+1]-F(rect[1]))*scale);}
 if(!selected.every(Number.isFinite))throw new RangeError('牙齿对齐坐标超出浮点范围');return selected;
}
// 147fe2e90只用外唇73..94：F32边界/中心/边长，double(-0.75)位移。
// 保留进入两个外部取整调用之前的值；不猜测148e0a2f0/148e09f60语义。
function measurePreparedToothRegion({landmarks}){
 const selected=selectPreparedToothLandmarks(landmarks);if(selected.length<190)throw new RangeError('牙齿外唇关键点数量不足');
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(let i=73;i<=94;i++){left=Math.min(left,selected[i*2]);right=Math.max(right,selected[i*2]);top=Math.min(top,selected[i*2+1]);bottom=Math.max(bottom,selected[i*2+1]);}
 const width=F(right-left),height=F(bottom-top),maximum=Math.max(width,height),unroundedSide=F(maximum*F(1.5)),unroundedOrigin=[maximum*(-.75)+F(left+F(width*.5)),maximum*(-.75)+F(top+F(height*.5))];
 if(![width,height,unroundedSide,...unroundedOrigin].every(Number.isFinite))throw new RangeError('牙齿原始区域超出浮点范围');
 return {mouthBounds:[left,top,width,height],unroundedOrigin,unroundedSide};
}
module.exports={selectPreparedToothLandmarks,clipPreparedToothRect,alignPreparedToothLandmarks,measurePreparedToothRegion};
