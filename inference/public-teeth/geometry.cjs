'use strict';
const {dimensions}=require('../public-portrait-geometry.cjs');
const {signedDistance}=require('../public-landmarks/protection.cjs');
// MediaPipe 官方内唇连接，出处与 Apache-2.0 声明见 ../public-landmarks/NOTICE。
const INNER_LIP=[78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
// 将可见口腔圈转换为原图裁剪；不使用会预测遮挡轮廓的 66 点备用结果。
function oralCrop(face,width,height){
 dimensions(width,height);if(face?.width!==width||face?.height!==height)throw new Error('口腔定位尺寸不一致');
 if(face?.type!=='mediapipe-478'||!Array.isArray(face.points)||face.points.length!==478||!face.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=4&&Math.abs(p.y)<=4))throw new Error('牙齿选区需要可靠的公开 478 点口腔定位');
 const points=INNER_LIP.map(i=>({x:face.points[i].x*width,y:face.points[i].y*height}));
 const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))-2),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y)))-2);
 const right=Math.min(width,Math.ceil(Math.max(...points.map(p=>p.x)))+2),bottom=Math.min(height,Math.ceil(Math.max(...points.map(p=>p.y)))+2);
 if(right<=left||bottom<=top)throw new Error('口腔定位在照片范围之外');
 return {crop:{left,top,width:right-left,height:bottom-top},polygon:points.map(p=>({x:p.x-left,y:p.y-top}))};
}
// 在口腔内用相对亮度、红色与粉色差异筛选牙齿；这是独立颜色方法，不是原版语义模型。
function selectTeethPixels(rgb,width,height,polygon){
 dimensions(width,height,512*512);if(width>512||height>512)throw new Error('口腔分析尺寸过大');
 if(!(rgb instanceof Uint8Array)||rgb.length!==width*height*3)throw new Error('口腔颜色数据无效');
 if(!Array.isArray(polygon)||polygon.length<3||polygon.length>32||!polygon.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=width*4&&Math.abs(p.y)<=height*4))throw new Error('口腔轮廓无效');
 const size=width*height,opening=new Float32Array(size),neutral=new Float32Array(size),luminance=new Float32Array(size),values=new Float32Array(size),levels=[];
 for(let i=0;i<size;i++){
  opening[i]=smooth(-.5,.5,-signedDistance(i%width+.5,Math.floor(i/width)+.5,polygon));if(!opening[i])continue;
  const r=rgb[i*3]/255,g=rgb[i*3+1]/255,b=rgb[i*3+2]/255,maximum=Math.max(.02,r,g,b);
  luminance[i]=.2126*r+.7152*g+.0722*b;
  neutral[i]=(1-smooth(.08,.25,(r-g)/maximum))*(1-smooth(.02,.18,(r+b-2*g)/maximum)); // 保留偏黄牙齿，降低红唇及粉色牙龈权重。
  if(opening[i]>.5&&neutral[i]>.5)levels.push(luminance[i]);
 }
 if(levels.length<3)return {values,width,height};
 levels.sort((a,b)=>a-b);const high=levels[Math.floor(levels.length*.85)];
 for(let i=0;i<size;i++)values[i]=opening[i]*neutral[i]*smooth(Math.max(.16,high*.58),Math.max(.24,high*.82),luminance[i]);
 // 每个连通区域需有至少三个明显牙齿像素，排除孤立口腔反光及过小的候选。
 const visited=new Uint8Array(size);
 for(let start=0;start<size;start++){
  if(visited[start]||values[start]<=0)continue;const component=[start];visited[start]=1;let core=0;
  for(let n=0;n<component.length;n++){
   const i=component[n],x=i%width,y=Math.floor(i/width);if(values[i]>.5)core++;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const j=yy*width+xx;if(!visited[j]&&values[j]>0){visited[j]=1;component.push(j);}}
  }
  if(core<3)for(const i of component)values[i]=0;
 }
 return {values,width,height};
}
module.exports={oralCrop,selectTeethPixels};
