'use strict';
const {createHairField,validateHairFrame}=require('../public-hair-smooth/core.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
function whiteHairSettings({strengthPercent,grayMass=false}={}){if(typeof strengthPercent!=='number'||!Number.isFinite(strengthPercent)||strengthPercent<0||strengthPercent>100||typeof grayMass!=='boolean')throw Error('去白发强度或模式无效');return {strengthPercent,grayMass};}
// 每个连通头发区域独立估计发色，不把另一人的发色当作本人的参考。
function components(mask,width,height){
 const labels=new Int32Array(mask.length),queue=new Int32Array(mask.length),regions=new Map();let id=0;
 for(let start=0;start<mask.length;start++)if(mask[start]>200&&!labels[start]){
  const key=++id;let head=0,tail=1;queue[0]=start;labels[start]=key;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const q=ny*width+nx;if(mask[q]>200&&!labels[q]){labels[q]=key;queue[tail++]=q;}}}
  if(tail>=6)regions.set(key,{hist:new Float64Array(32),count:0,neutral:0,red:0,green:0,blue:0,donors:0});
 }
 // 可靠核心只确定归属；向软边传播而不合并不同区域，强度仍由连续coverage决定。
 let head=0,tail=0;for(let i=0;i<labels.length;i++){if(regions.has(labels[i]))queue[tail++]=i;else labels[i]=0;}
 while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const q=ny*width+nx;if(mask[q]&&!labels[q]){labels[q]=labels[p];queue[tail++]=q;}}}
 return {labels,regions};
}
// 放大蒙版时从完整双线性支持域选择所属区域，不能仅看最近的零值标签。
function regionSampler(labels,mask,mw,mh,width,height){return (x,y)=>{
 const sx=clamp((x+.5)*mw/width-.5,0,mw-1),sy=clamp((y+.5)*mh/height-.5,0,mh-1),ix=Math.floor(sx),iy=Math.floor(sy),jx=Math.min(ix+1,mw-1),jy=Math.min(iy+1,mh-1),a=iy*mw+ix,b=iy*mw+jx,c=jy*mw+ix,d=jy*mw+jx;
 if(labels[a]&&labels[a]===labels[b]&&labels[a]===labels[c]&&labels[a]===labels[d])return labels[a];
 const dx=sx-ix,dy=sy-iy,ids=[labels[a],labels[b],labels[c],labels[d]],weights=[(1-dx)*(1-dy)*mask[a],dx*(1-dy)*mask[b],(1-dx)*dy*mask[c],dx*dy*mask[d]];let selected=0,best=0;
 for(let i=0;i<4;i++)if(ids[i]){let weight=0;for(let j=0;j<4;j++)if(ids[j]===ids[i])weight+=weights[j];if(weight>best){best=weight;selected=ids[i];}}
 return selected;
};}
function quantile(region,fraction){let sum=0;for(let i=0;i<32;i++){sum+=region.hist[i];if(sum>=region.count*fraction)return i*8+4;}return 252;}
// 先估计区域色素，再在原像素上识别灰白与重建明暗；不模糊、替换整片头发。
function correctWhiteHair(frame,options){
 validateHairFrame(frame);const {strengthPercent,grayMass}=whiteHairSettings(options),{data,width,height,mask,maskWidth:mw,maskHeight:mh}=frame,output=new Uint8Array(data);let changedRGBFields=0;if(!strengthPercent)return {output,changedRGBFields};
 const {coverage,read,qx,qy}=createHairField(frame),{labels,regions}=components(mask,mw,mh),grid=(x,y)=>clamp(Math.round((y+.5)*mh/height-.5),0,mh-1)*mw+clamp(Math.round((x+.5)*mw/width-.5),0,mw-1),labelAt=regionSampler(labels,mask,mw,mh,width,height),regionAt=(x,y)=>regions.get(labelAt(x,y));
 // 直方图从原像素累积，单像素白发不能在工作网格点采样时消失。
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,selection=coverage(x,y),weight=selection*data[i+3]/255;if(selection<=.5||!weight)continue;const r=regionAt(x,y);if(!r)continue;const lo=Math.min(data[i],data[i+1],data[i+2]),hi=Math.max(data[i],data[i+1],data[i+2]),L=luma(data[i],data[i+1],data[i+2]);r.hist[Math.min(31,Math.floor(L/8))]+=weight;r.count+=weight;if((hi-lo)/Math.max(1,hi)<.28)r.neutral+=weight;}
 for(const r of regions.values()){r.low=quantile(r,.3);r.median=quantile(r,.5);r.gray=grayMass||(r.low>85&&r.median>110&&r.neutral/Math.max(1,r.count)>.6);}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,selection=coverage(x,y),weight=selection*data[i+3]/255;if(selection<=.5||!weight)continue;const r=regionAt(x,y);if(!r||luma(data[i],data[i+1],data[i+2])>r.low+4)continue;r.red+=data[i]*weight;r.green+=data[i+1]*weight;r.blue+=data[i+2]*weight;r.donors+=weight;}
 for(const r of regions.values()){
  if(!r.donors)continue;r.color=[r.red/r.donors,r.green/r.donors,r.blue/r.donors];r.L=luma(...r.color);r.chroma=Math.max(...r.color)-Math.min(...r.color);r.saturation=r.chroma/Math.max(1,...r.color);
  if(r.gray){const target=clamp(r.low*.38,32,70),scale=target/Math.max(1,r.L);r.color=r.color.map(v=>v*scale);r.L=target;}
 }
 const sample=new Float64Array(4),other=new Float64Array(4),radius=Math.max(1,Math.min(8,Math.max(width,height)/1600));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,gate=coverage(x,y);if(!gate||!data[i+3])continue;const j=grid(x,y),label=labelAt(x,y),r=regions.get(label);if(!r?.donors)continue;
  const lo=Math.min(data[i],data[i+1],data[i+2]),hi=Math.max(data[i],data[i+1],data[i+2]),chroma=hi-lo,saturation=chroma/Math.max(1,hi),L=luma(data[i],data[i+1],data[i+2]),neutral=grayMass?1:clamp((.55-saturation)/.35,0,1),excess=clamp((L-r.L-12)/45,0,1);if(!neutral||!excess)continue;
  const angle=.5*Math.atan2(qy[j],qx[j]),nx=Math.cos(angle),ny=Math.sin(angle),coherence=Math.hypot(qx[j],qy[j]);let ridge=0;
  if(coherence>.25)for(const distance of [2,4]){const ax=x-nx*radius*distance,ay=y-ny*radius*distance,bx=x+nx*radius*distance,by=y+ny*radius*distance;if(labelAt(ax,ay)!==label||labelAt(bx,by)!==label||coverage(ax,ay)<.6||coverage(bx,by)<.6)continue;read(ax,ay,sample);read(bx,by,other);ridge=Math.max(ridge,clamp((L-Math.max(luma(...sample),luma(...other))-6)/28,0,1));}
  const specular=clamp((L-215)/30,0,1),colorLoss=r.chroma>12?clamp(1-chroma/(r.chroma*.8),0,1):0,shape=r.gray?.85*(1-specular):Math.max(ridge,colorLoss*.8*(1-specular)),amount=strengthPercent/100*gate*neutral*excess*shape;if(!amount)continue;
  let color=r.color,donorL=r.L;
  if(!r.gray){let red=0,green=0,blue=0,total=0;for(const distance of [1,2,4,8])for(const sign of [-1,1]){const sx=x+sign*nx*radius*distance,sy=y+sign*ny*radius*distance;if(sx<0||sy<0||sx>=width||sy>=height||labelAt(sx,sy)!==label||coverage(sx,sy)<.7)continue;read(sx,sy,sample);if(luma(...sample)>r.L+22||!sample[3])continue;const w=sample[3]/distance;red+=sample[0]*w;green+=sample[1]*w;blue+=sample[2]*w;total+=w;}if(total){color=[red/total,green/total,blue/total];donorL=luma(...color);}}
  const targetL=clamp(r.gray?r.L+(L-r.median)*.55:donorL+(L-donorL)*.18,1,230),scale=targetL/Math.max(1,donorL);
  for(let c=0;c<3;c++){const target=clamp(color[c]*scale,0,255),v=clamp(Math.round(data[i+c]+(target-data[i+c])*amount),0,255);output[i+c]=v;if(v!==data[i+c])changedRGBFields++;}
 }
 return {output,changedRGBFields};
}
module.exports={correctWhiteHair,whiteHairSettings};
