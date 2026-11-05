'use strict';
const connections=require('./connections.json');
const {dimensions}=require('../public-portrait-geometry.cjs');
const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
function hull(points){
 const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),lower=[],upper=[];
 for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
 for(const p of sorted.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
 const polygon=lower.slice(0,-1).concat(upper.slice(0,-1));
 if(polygon.length<3)throw new Error('面部轮廓无效，原选区已保留');return polygon;
}
function signedDistance(x,y,polygon){
 let inside=false,distance=Infinity;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],dx=b.x-a.x,dy=b.y-a.y;
  if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
  distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));
 }
 return inside?-distance:distance;
}
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
// 五官取凸包以覆盖眼球、牙齿和唇内区域；外围仅保留目标脸，避免选中旁人的皮肤。
function protectFacialFeatures(alpha,landmarks,width,height,{protectNostrils=false}={}){
 dimensions(width,height,1600*1600);
 if(!(alpha instanceof Uint8Array)||alpha.length!==width*height||landmarks?.type!=='mediapipe-478'||!Array.isArray(landmarks.points)||landmarks.points.length!==478||!landmarks.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=4&&Math.abs(p.y)<=4))throw new Error('面部定位数据无效，原选区已保留');
 const polygons=Object.fromEntries(Object.entries(connections).map(([name,edges])=>[name,hull([...new Set(edges.flatMap(e=>[e.start,e.end]))].map(index=>({x:landmarks.points[index].x*width,y:landmarks.points[index].y*height})))]));
 // Dark nostril openings look like compact spots. Only spot repair needs these exclusions.
 if(protectNostrils)for(const [name,ids] of [['leftNostril',[49,220,45,44,97,98,64,48]],['rightNostril',[279,440,275,274,326,327,294,278]]]){
  polygons[name]=hull(ids.map(index=>({x:landmarks.points[index].x*width,y:landmarks.points[index].y*height})));
 }
 const oval=polygons.oval,xs=oval.map(p=>p.x),ys=oval.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.sqrt((maxX-minX)*(maxY-minY));if(!Number.isFinite(scale)||scale<2)throw new Error('面部轮廓过小，原选区已保留');
 const padding=scale*.035,feather=Math.max(.75,scale*.015),output=Buffer.alloc(alpha.length);
 for(let y=Math.max(0,Math.floor(minY-padding-feather));y<Math.min(height,Math.ceil(maxY+padding+feather));y++)for(let x=Math.max(0,Math.floor(minX-padding-feather));x<Math.min(width,Math.ceil(maxX+padding+feather));x++){
  const i=y*width+x;if(!alpha[i])continue;
  let keep=1-smooth((signedDistance(x+.5,y+.5,oval)-padding)/feather);
  for(const [name,polygon] of Object.entries(polygons)){if(name==='oval'||!keep)continue;keep*=smooth((signedDistance(x+.5,y+.5,polygon)-(name.endsWith('Nostril')?padding*.4:padding))/feather);}
  output[i]=Math.round(alpha[i]*keep);
 }
 return output;
}
module.exports={protectFacialFeatures,signedDistance};
