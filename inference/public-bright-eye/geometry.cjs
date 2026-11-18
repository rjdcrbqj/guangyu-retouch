"use strict";
const {signedDistance}=require('../public-landmarks/protection.cjs');
const connections=require('../public-landmarks/connections.json');
const rings=[[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],[263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]];
const smooth=v=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
// 478 点直接生成独立眼部蒙版；不构造原版 194 点或原版网格缓存。
function preparePublicEyes(face){
 const {width,height,points}=face||{};
 if(face?.type!=='mediapipe-478'||!Array.isArray(points)||points.length!==478||!points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=4&&Math.abs(p.y)<=4)||![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=32768)||width*height>80000000)throw Error('眼部定位必须使用有效的公开 478 点');
 const xy=i=>({x:points[i].x*width,y:points[i].y*height}),sides=[];
 for(let side=0;side<2;side++){
  const polygon=rings[side].map(xy),a=polygon[0],b=polygon[8],eyeWidth=Math.hypot(b.x-a.x,b.y-a.y);
  if(eyeWidth<8||polygon.some(p=>p.x<0||p.y<0||p.x>=width||p.y>=height))continue;
  const heights=polygon.map(p=>((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/eyeWidth),opening=Math.max(...heights)-Math.min(...heights);
  if(opening/eyeWidth<.12)continue; // 闭眼或过度眯眼不生成修饰区域。
  const id=side?473:468,center=xy(id),ring=[1,2,3,4].map(i=>xy(id+i));
  const u={x:(ring[0].x-ring[2].x)/2,y:(ring[0].y-ring[2].y)/2},v={x:(ring[1].x-ring[3].x)/2,y:(ring[1].y-ring[3].y)/2},det=u.x*v.y-u.y*v.x;
  const ru=Math.hypot(u.x,u.y),rv=Math.hypot(v.x,v.y);
  if(Math.abs(det)<1||Math.min(ru,rv)<1||Math.max(ru,rv)>eyeWidth*.45||signedDistance(center.x,center.y,polygon)>=0)continue;
  const left=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p.x)))-2),top=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p.y)))-2),right=Math.min(width,Math.ceil(Math.max(...polygon.map(p=>p.x)))+2),bottom=Math.min(height,Math.ceil(Math.max(...polygon.map(p=>p.y)))+2),rw=right-left,rh=bottom-top,scale=Math.min(1,256/Math.max(rw,rh)),mw=Math.max(1,Math.round(rw*scale)),mh=Math.max(1,Math.round(rh*scale)),rgba=Buffer.alloc(mw*mh*4),feather=Math.max(.5,eyeWidth*.02);
  let usable=false;
  for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
   const px=left+(x+.5)*rw/mw,py=top+(y+.5)*rh/mh,keep=smooth(-signedDistance(px,py,polygon)/feather),dx=px-center.x,dy=py-center.y,aa=(dx*v.y-dy*v.x)/det,bb=(u.x*dy-u.y*dx)/det;
   const iris=keep*smooth((1.15-Math.hypot(aa,bb))/.2),i=(y*mw+x)*4;
   rgba[i]=Math.round((keep-iris)*255);rgba[i+1]=rgba[i+2]=Math.round(iris*255);rgba[i+3]=255;if(rgba[i]+rgba[i+1]>127)usable=true;
  }
  if(usable)sides.push({side,roi:[left,top,rw,rh],maskWidth:mw,maskHeight:mh,rgbaBase64:rgba.toString('base64')});
 }
 return {format:'guangyu-public-bright-eye-face',version:1,sourceWH:[width,height],sides};
}
const protectionGap = 2;
const browSegments = [connections.rightBrow, connections.leftBrow]
  .map(edges => edges.map(({start,end}) => [start,end]));
const noseSegments = [[168,6],[6,197],[197,195],[195,5],[5,4],[4,1]];
const ovalSegments = connections.oval.map(({start,end}) => [start,end]);

function dot([ax,ay],[bx,by]){return ax*bx+ay*by;}

function segmentRadius(a,b){
  const delta=[b[0]-a[0],b[1]-a[1]];
  const length=dot(delta,delta);
  const t=length?Math.max(0,Math.min(1,-dot(a,delta)/length)):0;
  return Math.hypot(a[0]+delta[0]*t,a[1]+delta[1]*t);
}

function supportsSeparated(a,b){
  const offset=[b.center[0]-a.center[0],b.center[1]-a.center[1]],distance=Math.hypot(...offset);
  if(!distance)return false;
  const direction=offset.map(value=>value/distance);
  const extent=({axis:[x,y],radii:[rx,ry]})=>Math.hypot(rx*dot(direction,[x,y]),ry*dot(direction,[-y,x]));
  return distance-extent(a)-extent(b)>=protectionGap;
}

function prepareEyeSizeFace(face){
  // Face shape and side visibility are validated by preparePublicEyes before this step.
  const {width,height,points}=face;
  const xy=id=>[points[id].x*width,points[id].y*height];
  const eyes=[];
  for(let side=0;side<2;side++){
    const polygon=rings[side].map(xy);
    const [a,b]=[polygon[0],polygon[8]].sort((left,right)=>left[0]-right[0]);
    const dx=b[0]-a[0],dy=b[1]-a[1],eyeWidth=Math.hypot(dx,dy);
    if(eyeWidth<14)return null;
    const center=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const axis=[dx/eyeWidth,dy/eyeWidth],vertical=[-axis[1],axis[0]];
    const relative=([x,y])=>[x-center[0],y-center[1]];
    const eyelidY=polygon.map(point=>dot(relative(point),vertical));
    const opening=Math.max(...eyelidY)-Math.min(...eyelidY);
    if(opening<4||opening/eyeWidth<.18)return null;
    const rx=.75*eyeWidth,ry=Math.max(.30*eyeWidth,Math.max(...eyelidY.map(Math.abs))+Math.max(2,.07*eyeWidth));
    const toUnit=point=>{
      const local=relative(point);
      return [dot(local,axis)/rx,dot(local,vertical)/ry];
    };
    if(polygon.some(point=>Math.hypot(...toUnit(point))>=.85))return null;
    const [x,y]=center;
    if(Math.min(x,width-x)-Math.hypot(rx*axis[0],ry*vertical[0])<protectionGap||
      Math.min(y,height-y)-Math.hypot(rx*axis[1],ry*vertical[1])<protectionGap)return null;

    // Check normalized ellipse clearance to the actual feature segments.
    // The smaller semiaxis converts the result to a conservative pixel-distance bound.
    const protectedEdges=[...browSegments[side],...noseSegments,...ovalSegments];
    if(protectedEdges.some(([start,end])=>(segmentRadius(toUnit(xy(start)),toUnit(xy(end)))-1)*Math.min(rx,ry)<protectionGap))return null;
    eyes.push({center,axis,radii:[rx,ry]});
  }
  return supportsSeparated(...eyes)?eyes:null;
}

function separateEyeSizeFaces(faces){
  return faces.filter((eyes,index)=>faces.every((other,i)=>
    i===index||eyes.every(eye=>other.every(neighbor=>supportsSeparated(eye,neighbor)))));
}

module.exports={preparePublicEyes,prepareEyeSizeFace,separateEyeSizeFaces};
