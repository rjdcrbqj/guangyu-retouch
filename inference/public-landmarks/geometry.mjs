const average=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export function boxOverlap(a,b){const intersection=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return intersection/(a.width*a.height+b.width*b.height-intersection);}
// 用独立找脸器的五点核对五官方向与位置，拒绝“点数完整但把眼口认反”的结果。
export function matchesAnchors(points,box){
 if(!box.keypoints)return true;
 if(![1,33,133,263,362,61,291].every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)))return false;
 return matchesAnchorTriplet([average(average(points[33],points[133]),average(points[263],points[362])),points[1],average(points[61],points[291])],box);
}
export function matchesAnchorTriplet(actual,box){
 if(!box||!Number.isFinite(box.width)||!Number.isFinite(box.height)||box.width<=0||box.height<=0||!Array.isArray(actual)||actual.length!==3||!actual.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return false;
 const k=box.keypoints;if(!Array.isArray(k)||k.length!==5||!k.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return false;
 const expected=[average(k[0],k[1]),k[2],average(k[3],k[4])];
 const vector=p=>({x:(p[2].x-p[0].x)/box.width,y:(p[2].y-p[0].y)/box.height}),a=vector(actual),b=vector(expected),length=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);
 if(length<1e-8||(a.x*b.x+a.y*b.y)/length<.5)return false;
 const error=Math.sqrt(actual.reduce((sum,p,i)=>sum+((p.x-expected[i].x)/box.width)**2+((p.y-expected[i].y)/box.height)**2,0)/3);
 return error<=.35;
}
export function selectFace(faces,box){
 let best=null,bestOverlap=.1;
 for(const points of faces){
  if(!matchesAnchors(points,box))continue;
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
  const overlap=boxOverlap({x:left,y:top,width:right-left,height:bottom-top},box);
  if(overlap>bestOverlap){best=points;bestOverlap=overlap;}
 }
 return best;
}

export function unrotateLandmarks(points,rotation,width,height){
 const side=Math.max(width,height),angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return points.map(p=>{
  if(!rotation)return {x:p.x,y:p.y,z:p.z};
  const dx=(p.x-.5)*side,dy=(p.y-.5)*side;
  return {x:(c*dx+s*dy+width/2)/width,y:(-s*dx+c*dy+height/2)/height,z:p.z*side/width};
 });
}
// 只有目标脸匹配成功才结束搜索；邻脸不应截断目标侧脸的回退。
export async function searchLandmarks(detect,box){
 if(!box||!['x','y','width','height'].every(k=>Number.isFinite(box[k]))||box.width<=0||box.height<=0)throw new Error('目标人脸框无效');
 const rotationsTried=[];
 for(const threshold of [.5,.3])for(const rotation of [0,45,-45,90,-90,135,-135,180]){
  const faces=await detect(rotation,threshold);rotationsTried.push(rotation);
  if(selectFace(faces,box))return {faces,rotationsTried,detectionThreshold:threshold};
 }
 return {faces:[],rotationsTried,detectionThreshold:.3};
}
