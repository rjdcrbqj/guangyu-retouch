'use strict';
const {preparePublicEyes}=require('../public-bright-eye/geometry.cjs');
// 复用公开眼圈保护，只补充红眼像素处理需要的原尺寸虹膜坐标。
function prepareRedEyeRegions(face){
 const prepared=preparePublicEyes(face),xy=id=>[face.points[id].x*face.width,face.points[id].y*face.height];
 return prepared.sides.map(side=>{
  const id=side.side?473:468,ring=[1,2,3,4].map(i=>xy(id+i));
  return {side:side.side,roi:side.roi,maskWidth:side.maskWidth,maskHeight:side.maskHeight,rgba:Buffer.from(side.rgbaBase64,'base64'),iris:{center:xy(id),u:ring[0].map((v,i)=>(v-ring[2][i])/2),v:ring[1].map((v,i)=>(v-ring[3][i])/2)}};
 });
}
module.exports={prepareRedEyeRegions};
