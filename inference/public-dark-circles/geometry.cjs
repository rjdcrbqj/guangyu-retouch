"use strict";
const lids=[[33,7,163,144,145,153,154,155,133],[263,249,390,373,374,380,381,382,362]];
function underEyeRegion(face,side,{referenceBottom=1.2}={}){
 if(!Number.isFinite(referenceBottom)||referenceBottom<1.2||referenceBottom>2)throw Error('眼下参考范围无效');
 const {width,height,points}=face||{};
 if(face?.type!=='mediapipe-478'||!Array.isArray(points)||points.length!==478||!points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=4&&Math.abs(p.y)<=4)||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=32768)||width*height>80000000||![0,1].includes(side))throw Error('眼下区域必须使用有效的公开 478 点');
 const xy=i=>[points[i].x*width,points[i].y*height],polygon=lids[side].map(xy),a=polygon[0],b=polygon[8],eyeWidth=Math.hypot(b[0]-a[0],b[1]-a[1]);if(eyeWidth<8)return null;
 const origin=[(a[0]+b[0])/2,(a[1]+b[1])/2],u=[(b[0]-a[0])/eyeWidth,(b[1]-a[1])/eyeWidth],mouth=xy(13),down=[-u[1],u[0]];if((mouth[0]-origin[0])*down[0]+(mouth[1]-origin[1])*down[1]<0){down[0]*=-1;down[1]*=-1;}
 const lower=Math.max(...polygon.map(p=>(p[0]-origin[0])*down[0]+(p[1]-origin[1])*down[1]));if(lower>eyeWidth*.5)return null;
 const corners=[[-.8,-.25],[.8,-.25],[-.8,referenceBottom],[.8,referenceBottom]].map(([x,y])=>[origin[0]+u[0]*eyeWidth*x+down[0]*(lower+eyeWidth*y),origin[1]+u[1]*eyeWidth*x+down[1]*(lower+eyeWidth*y)]),left=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[0])))-2),top=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[1])))-2),right=Math.min(width,Math.ceil(Math.max(...corners.map(p=>p[0])))+2),bottom=Math.min(height,Math.ceil(Math.max(...corners.map(p=>p[1])))+2);if(right-left<4||bottom-top<4)return null;
 return {origin,u,down,eyeWidth,lower,crop:{left,top,width:right-left,height:bottom-top}};
}
module.exports={underEyeRegion};
