'use strict';
// Research transcription of finite U8 max and original shift0 LINE8+edge-fill.
// No original executable or modernCV call. Explicit integer Point2l domain.
function dilate({data,width,height,kernel}){
 if(!(data instanceof Uint8Array)||data.length!==width*height||![width,height].every(n=>Number.isInteger(n)&&n>0)||![1,2,4,5,9,11,19].includes(kernel))throw RangeError('explicit compact BYTE/domain');
 const a=kernel>>1,tmp=new Uint8Array(data.length),out=new Uint8Array(data.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let z=0;for(let j=0;j<kernel;j++){const xx=x+j-a;if(xx>=0&&xx<width)z=Math.max(z,data[y*width+xx]);}tmp[y*width+x]=z;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let z=0;for(let j=0;j<kernel;j++){const yy=y+j-a;if(yy>=0&&yy<height)z=Math.max(z,tmp[yy*width+x]);}out[y*width+x]=z;}
 return out;
}
function clipLine(p,q,w,h){
 let [x1,y1]=p,[x2,y2]=q;
 const code=(x,y)=>(x<0?1:x>=w?2:0)|(y<0?4:y>=h?8:0);
 let c1=code(x1,y1),c2=code(x2,y2);if(c1&c2)return null;
 if(c1||c2){
  if(c1&12){const y=c1&8?h-1:0;x1+=Math.trunc((x2-x1)*(y-y1)/(y2-y1));y1=y;c1=code(x1,y1);}
  if(c2&12){const y=c2&8?h-1:0;x2+=Math.trunc((x2-x1)*(y-y2)/(y2-y1));y2=y;c2=code(x2,y2);}
  if(c1&c2)return null;
  if(c1||c2){
   if(c1){const x=c1===1?0:w-1;y1+=Math.trunc((y2-y1)*(x-x1)/(x2-x1));x1=x;c1=0;}
   if(c2){const x=c2===1?0:w-1;y2+=Math.trunc((y2-y1)*(x-x2)/(x2-x1));x2=x;c2=0;}
  }
 }
 return [[x1,y1],[x2,y2]];
}
function drawLine(out,p,q,w,h){
 const clipped=clipLine(p,q,w,h);if(!clipped)return;
 let [[x,y],[xx,yy]]=clipped,dx=xx-x,dy=yy-y;
 if(dx<0){[x,y]=[xx,yy];dx=-dx;dy=-dy;}
 const sy=dy<0?-1:1;dy=Math.abs(dy);const steep=dx<dy;if(steep)[dx,dy]=[dy,dx];let err=dx-2*dy;
 for(let i=0;i<=dx;i++){out[y*w+x]=255;const diagonal=err<0;err-=2*dy;if(diagonal)err+=2*dx;if(steep){y+=sy;if(diagonal)x++;}else{x++;if(diagonal)y+=sy;}}
}
function fillPolygon({points,width,height}){
 if(!Array.isArray(points)||points.length<2||points.length>31||!points.every(p=>p.length===2&&p.every(n=>Number.isInteger(n)&&Math.abs(n)<=1e6))||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=4096))throw RangeError('explicit S32 Point2l/finite bounded domain');
 const out=new Uint8Array(width*height),edges=[];let prev=points.at(-1);
 for(const p of points){drawLine(out,prev,p,width,height);if(p[1]!==prev[1]){const dx=BigInt(p[0]-prev[0])*65536n/BigInt(p[1]-prev[1]);const upper=p[1]<prev[1]?p:prev;edges.push({y0:Math.min(p[1],prev[1]),y1:Math.max(p[1],prev[1]),x:BigInt(upper[0])*65536n,dx});}prev=p;}
 edges.sort((a,b)=>a.y0-b.y0||Number(a.x-b.x)||Number(a.dx-b.dx));if(edges.length<2)return out;
 let active=[],at=0;const last=Math.min(height,Math.max(...edges.map(e=>e.y1)));
 for(let y=edges[0].y0;y<last;y++){
  active=active.filter(e=>e.y1!==y);while(at<edges.length&&edges[at].y0===y){const e=edges[at++];let i=0;while(i<active.length&&active[i].x<e.x)i++;active.splice(i,0,e);}
  for(let i=0;i+1<active.length;i+=2){const e1=active[i],e2=active[i+1],lo=e1.x<e2.x?e1.x:e2.x,hi=e1.x>e2.x?e1.x:e2.x;
   if(y>=0){let x1=Number((lo+65535n)>>16n),x2=Number(hi>>16n);x1=Math.max(0,x1);x2=Math.min(width-1,x2);if(x1<=x2)out.fill(255,y*width+x1,y*width+x2+1);}
   e1.x+=e1.dx;e2.x+=e2.dx;
  }
  active.sort((a,b)=>Number(a.x-b.x));
 }
 return out;
}
function erode({data,width,height,kernel}){
 if(!(data instanceof Uint8Array)||data.length!==width*height||![width,height].every(n=>Number.isInteger(n)&&n>0)||kernel!==5)throw RangeError('explicit compact BYTE/erode5');
 const a=kernel>>1,tmp=new Uint8Array(data.length),out=new Uint8Array(data.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let z=255;for(let j=0;j<kernel;j++){const xx=x+j-a;if(xx>=0&&xx<width)z=Math.min(z,data[y*width+xx]);}tmp[y*width+x]=z;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let z=255;for(let j=0;j<kernel;j++){const yy=y+j-a;if(yy>=0&&yy<height)z=Math.min(z,tmp[yy*width+x]);}out[y*width+x]=z;}
 return out;
}
module.exports={dilate,erode,fillPolygon,clipLine};
