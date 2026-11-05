export const PUBLIC_EYE_FORMAT='guangyu-public-bright-eye-face';
// 从已验证的旧工程眼环生成普通分区；仅使用用户工程里的几何与高光。
export function publicFacesFromLegacy(faces){
 const smooth=v=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
 const protections=faces.filter(face=>face.extra).map(face=>({plane:atob(face.extra.plane3Base64),matrix:new Float32Array(Uint32Array.from(face.extra.projectionBits).buffer)}));
 // 旧工程保存的矩阵从原图归一化坐标投影到蒙版；双线性采样保留软边。
 const protectionAt=(px,py,width,height)=>{
  if(!protections.length)return 1;
  let coverage=0;
  for(const {plane,matrix:m}of protections){
   const u=px/width,v=py/height,mx=m[0]*u+m[3]*v+m[6],my=m[1]*u+m[4]*v+m[7];
   if(mx<0||mx>1||my<0||my>1)continue;
   const x=Math.max(0,Math.min(255,mx*256-.5)),y=Math.max(0,Math.min(255,my*256-.5)),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(255,x0+1),y1=Math.min(255,y0+1),dx=x-x0,dy=y-y0;
   const top=plane.charCodeAt(y0*256+x0)*(1-dx)+plane.charCodeAt(y0*256+x1)*dx,bottom=plane.charCodeAt(y1*256+x0)*(1-dx)+plane.charCodeAt(y1*256+x1)*dx;
   coverage=Math.max(coverage,(top*(1-dy)+bottom*dy)/255);
  }
  return coverage;
 };
 return faces.map(face=>{
  if(face.format===PUBLIC_EYE_FORMAT)return face;
  const sides=[];
  for(const side of face.sides){
   if(side.closed)continue;
   const points=new Float32Array(Uint32Array.from(side.pupilBits).buffer),ring=Array.from({length:24},(_,i)=>[points[2+i*2],points[3+i*2]]),[rx,ry,rw,rh]=side.ROI;
   const minY=Math.min(...ring.map(p=>p[1])),maxY=Math.max(...ring.map(p=>p[1])),radius=(maxY-minY)*.45;
   if(radius<.5)continue;
   const scale=Math.min(1,256/Math.max(rw,rh)),mw=Math.max(1,Math.round(rw*scale)),mh=Math.max(1,Math.round(rh*scale)),bytes=new Uint8Array(mw*mh*4),highlight=atob(side.highlightBase64);
   for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
    const px=rx+(x+.5)*rw/mw,py=ry+(y+.5)*rh/mh;let inside=false,distance=Infinity;
    for(let j=0,k=23;j<24;k=j++){
     const a=ring[j],b=ring[k],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/len)):0;
     distance=Math.min(distance,Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy));
     if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    const keep=inside?smooth(distance/Math.max(.75,rw*.02))*protectionAt(px,py,...face.sourceWH):0,iris=keep*smooth((radius-Math.hypot(px-points[0],py-points[1]))/Math.max(.75,radius*.25)),i=(y*mw+x)*4;
    bytes[i]=Math.round((keep-iris)*255);bytes[i+1]=Math.round(iris*255);
    bytes[i+2]=Math.round(iris*highlight.charCodeAt(Math.min(199,Math.floor((y+.5)*200/mh))*200+Math.min(199,Math.floor((x+.5)*200/mw))));bytes[i+3]=255;
   }
   let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   sides.push({side:side.side,roi:[...side.ROI],maskWidth:mw,maskHeight:mh,rgbaBase64:btoa(binary)});
  }
  return {format:PUBLIC_EYE_FORMAT,version:1,sourceWH:[...face.sourceWH],sides};
 });
}
// 普通字节蒙版采用独立格式，与旧网格缓存互不混用。
export function validatePublicBrightEyeFaces(faces,{sourceWH}={}){
 if(!Array.isArray(faces)||faces.length>8)throw Error('亮眼人脸缓存数量无效');
 return faces.map(face=>{
  if(face?.format!==PUBLIC_EYE_FORMAT||face.version!==1||!Array.isArray(face.sourceWH)||face.sourceWH.length!==2||!face.sourceWH.every(n=>Number.isSafeInteger(n)&&n>0&&n<=32768)||face.sourceWH[0]*face.sourceWH[1]>80000000)throw Error('亮眼照片缓存无效');
  if(sourceWH&&face.sourceWH.some((n,i)=>n!==sourceWH[i]))throw Error('亮眼缓存与照片尺寸不匹配');
  if(!Array.isArray(face.sides)||face.sides.length>2)throw Error('亮眼眼区缓存无效');const seen=new Set();
  const sides=face.sides.map(s=>{
   if(!s||![0,1].includes(s.side)||seen.has(s.side))throw Error('亮眼侧别缓存无效');seen.add(s.side);
   if(!Array.isArray(s.roi)||s.roi.length!==4||!s.roi.every(Number.isSafeInteger)||s.roi[0]<0||s.roi[1]<0||s.roi[2]<1||s.roi[3]<1||s.roi[0]+s.roi[2]>face.sourceWH[0]||s.roi[1]+s.roi[3]>face.sourceWH[1])throw Error('亮眼裁切缓存无效');
   if(![s.maskWidth,s.maskHeight].every(n=>Number.isInteger(n)&&n>0&&n<=256))throw Error('亮眼蒙版尺寸无效');
   const size=s.maskWidth*s.maskHeight*4;if(typeof s.rgbaBase64!=='string'||s.rgbaBase64.length!==Math.ceil(size/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(s.rgbaBase64)||atob(s.rgbaBase64).length!==size)throw Error('亮眼蒙版缓存无效');
   return {side:s.side,roi:[...s.roi],maskWidth:s.maskWidth,maskHeight:s.maskHeight,rgbaBase64:s.rgbaBase64};
  });
  return {format:face.format,version:1,sourceWH:[...face.sourceWH],sides};
 });
}
