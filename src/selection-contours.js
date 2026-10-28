// 仅提取预览轮廓：半透明蒙版以128为边界，原蒙版与实际效果强度保持不变。
export function traceMaskContours(rgba,width,height,threshold=128){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw new Error('选区尺寸无效');
 const edges=[],outgoing=new Map(),stride=width+1;
 const inside=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&rgba[(y*width+x)*4+3]>=threshold;
 const add=(x,y,ex,ey,dir)=>{const start=y*stride+x,end=ey*stride+ex,edge={start,end,dir,used:false};edges.push(edge);if(!outgoing.has(start))outgoing.set(start,[]);outgoing.get(start).push(edge);};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(inside(x,y)){
  if(!inside(x,y-1))add(x,y,x+1,y,0);
  if(!inside(x+1,y))add(x+1,y,x+1,y+1,1);
  if(!inside(x,y+1))add(x+1,y+1,x,y+1,2);
  if(!inside(x-1,y))add(x,y+1,x,y,3);
 }
 const loops=[],point=n=>[n%stride,Math.floor(n/stride)],rank=[1,0,3,2];
 for(const first of edges){if(first.used)continue;const points=[point(first.start)];let edge=first;
  while(edge&&!edge.used){edge.used=true;points.push(point(edge.end));if(edge.end===first.start)break;
   const choices=(outgoing.get(edge.end)??[]).filter(e=>!e.used),direction=edge.dir;
   choices.sort((a,b)=>rank[(a.dir-direction+4)%4]-rank[(b.dir-direction+4)%4]);edge=choices[0];
  }
  loops.push(points);
 }
 return loops;
}
