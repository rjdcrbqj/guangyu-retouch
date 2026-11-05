'use strict';
const connections=require('./connections.json');
const {dimensions}=require('../public-portrait-geometry.cjs');
const {signedDistance}=require('./protection.cjs');
// 从官方连接表恢复闭环或开放链，保留弧形边界，不用凸包代替实际五官形状。
function paths(edges){
 const neighbours=new Map();for(const {start,end} of edges){for(const [a,b] of [[start,end],[end,start]]){if(!neighbours.has(a))neighbours.set(a,[]);neighbours.get(a).push(b);}}
 const unseen=new Set(neighbours.keys()),result=[];
 while(unseen.size){
  const component=[],pending=[unseen.values().next().value],seen=new Set();
  while(pending.length){const id=pending.pop();if(seen.has(id))continue;seen.add(id);component.push(id);pending.push(...neighbours.get(id));}
  if(component.some(id=>neighbours.get(id).length>2))throw new Error('面部连接表有分支');
  const start=component.find(id=>neighbours.get(id).length===1)??component[0],chain=[];let current=start,previous;
  while(current!==undefined&&!chain.includes(current)){chain.push(current);unseen.delete(current);const next=neighbours.get(current).find(id=>id!==previous);previous=current;current=next;}
  if(chain.length!==component.length)throw new Error('面部连接表不完整');result.push(chain);
 }
 return result;
}
const lipChains66=[[58,48,49,50,51,52,62,53,54,55,56,57],[58,59,60,61,62,63,64,65]];
const topology={lips:paths(connections.lips),leftBrow:paths(connections.leftBrow),rightBrow:paths(connections.rightBrow)};
const area=polygon=>Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p.x*q.y-q.x*p.y;},0)/2);
const distance=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
function browPolygon(chains){
 const [a,b]=chains;if(chains.length!==2)throw new Error('眉毛轮廓无效');
 const forward=distance(a.at(-1),b[0])+distance(b.at(-1),a[0]),reverse=distance(a.at(-1),b.at(-1))+distance(b[0],a[0]);
 return a.concat(forward<=reverse?b:b.slice().reverse());
}
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
function facialRegionMask(landmarks,width,height,kind){
 dimensions(width,height,1600*1600);if(width>1600||height>1600)throw new Error('选区尺寸过大');
 if(!['lips','eyebrows'].includes(kind))throw new Error('不支持的人像分区');
 const points=landmarks?.points;
 const count=landmarks?.type==='mediapipe-478'?478:landmarks?.type==='openseeface-66'?66:0;
 if(!count||!Array.isArray(points)||points.length!==count||!points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=4&&Math.abs(p.y)<=4))throw new Error('面部定位数据无效，原选区已保留');
 if(count===66&&kind!=='lips')throw new Error('公开 66 点仅提供嘴唇分区，眉毛中心线不能替代边界');
 const mapped=chains=>chains.map(chain=>chain.map(i=>({x:points[i].x*width,y:points[i].y*height}))),regions=[];
 if(kind==='lips'){
  // OpenSeeFace has shared corners 58/62; its outer ring is NOT indices 48..59.
  const loops=mapped(count===66?lipChains66:topology.lips).sort((a,b)=>area(b)-area(a));if(loops.length!==2)throw new Error('嘴唇轮廓无效');
  regions.push({outer:loops[0],inner:area(loops[1])>.01?loops[1]:null});
 }else for(const name of ['leftBrow','rightBrow'])regions.push({outer:browPolygon(mapped(topology[name]))});
 const alpha=Buffer.alloc(width*height);
 for(const {outer,inner} of regions){
  if(area(outer)<.05)continue;
  const xs=outer.map(p=>p.x),ys=outer.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const feather=Math.max(.5,Math.min(1.25,(maxX-minX)*.025));
  for(let y=Math.max(0,Math.floor(minY-feather));y<Math.min(height,Math.ceil(maxY+feather));y++)for(let x=Math.max(0,Math.floor(minX-feather));x<Math.min(width,Math.ceil(maxX+feather));x++){
   let weight=smooth(.5-signedDistance(x+.5,y+.5,outer)/feather);
   if(inner)weight*=smooth(.5+signedDistance(x+.5,y+.5,inner)/feather);
   const i=y*width+x;alpha[i]=Math.max(alpha[i],Math.round(weight*255));
  }
 }
 if(!alpha.some(v=>v>0))throw new Error('五官轮廓过小或不可用，原选区已保留');
 return alpha;
}
function lipPolygons(landmarks,width,height){
 dimensions(width,height);const points=landmarks?.points,count=landmarks?.type==='mediapipe-478'?478:landmarks?.type==='openseeface-66'?66:0;
 if(!count||!Array.isArray(points)||points.length!==count||!points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=4&&Math.abs(p.y)<=4))throw Error('公开嘴唇定位数据无效');
 const chains=count===66?lipChains66:topology.lips,loops=chains.map(chain=>chain.map(i=>({x:points[i].x*width,y:points[i].y*height}))).sort((a,b)=>area(b)-area(a));
 return {outer:loops[0],inner:loops[1]}; // 即使闭口后面积为零，也保留内轮廓用于保护闭口线。
}
module.exports={facialRegionMask,lipPolygons};
