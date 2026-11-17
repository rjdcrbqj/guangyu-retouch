'use strict';
const {preparePublicEyes}=require('../public-bright-eye/geometry.cjs');
// 沿用公开眼圈/可见性契约，额外返回原尺寸虹膜椭圆；左右按图像横坐标定义。
function prepareIrisRegions(face){
 const prepared=preparePublicEyes(face),xy=id=>[face.points[id].x*face.width,face.points[id].y*face.height],firstIsLeft=face.points[468].x<=face.points[473].x;
 return prepared.sides.map(region=>{
  const id=region.side?473:468,ring=[1,2,3,4].map(i=>xy(id+i));
  return {side:firstIsLeft?region.side:1-region.side,roi:region.roi,maskWidth:region.maskWidth,maskHeight:region.maskHeight,rgba:Buffer.from(region.rgbaBase64,'base64'),iris:{center:xy(id),u:ring[0].map((v,i)=>(v-ring[2][i])/2),v:ring[1].map((v,i)=>(v-ring[3][i])/2)}};
 });
}
module.exports={prepareIrisRegions};
