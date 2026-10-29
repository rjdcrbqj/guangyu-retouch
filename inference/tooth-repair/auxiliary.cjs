'use strict';
const {fillPolygonFloat32}=require('../opencv-runtime.cjs');
const INDICES=[95,96,97,98,99,100,101,102,103,104,105,106,95];
// 已对齐512像素工作图的关键点。147fdb400选取13点，乘0.5后截断，
// 以fillPoly/LINE_8在256×256 float32零图中填1；不做字节归一化。
function prepareToothRepairAuxiliary({landmarks}){
 if(!(landmarks instanceof Float32Array)||landmarks.length<214||landmarks.length%2!==0)throw new RangeError('牙齿关键点数量或类型无效');
 const points=INDICES.map(i=>[landmarks[i*2],landmarks[i*2+1]].map(v=>{const scaled=Math.fround(v*.5);if(!Number.isFinite(scaled)||scaled< -2147483648||scaled>=2147483648)throw new RangeError('牙齿关键点坐标无效');return Math.trunc(scaled);}));
 return {data:fillPolygonFloat32({width:256,height:256,points}),width:256,height:256};
}
module.exports={prepareToothRepairAuxiliary};
