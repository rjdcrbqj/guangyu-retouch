'use strict';
const {confidence}=require('../public-skin-confidence.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
function hairSettings({smoothPercent,detailPercent}={}){
 if(![smoothPercent,detailPercent].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))throw Error('柔顺和发丝细节强度须为0至100');
 return {smoothPercent,detailPercent};
}
// 所有邻域读取按alpha加权，隐藏RGB与背景不会进入半透明发丝。
function sampler(data,width,height,coverage){return (x,y,out)=>{
 x=clamp(x,0,width-1);y=clamp(y,0,height-1);const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,width-1),jy=Math.min(iy+1,height-1),dx=x-ix,dy=y-iy;
 const indices=[(iy*width+ix)*4,(iy*width+jx)*4,(jy*width+ix)*4,(jy*width+jx)*4],weights=[(1-dx)*(1-dy),dx*(1-dy),(1-dx)*dy,dx*dy];let alpha=0;out.fill(0);
 for(let k=0;k<4;k++){const i=indices[k],weight=weights[k]*data[i+3]/255*coverage(k%2?jx:ix,k<2?iy:jy);alpha+=weight;for(let c=0;c<3;c++)out[c]+=weight*data[i+c];}
 if(alpha)for(let c=0;c<3;c++)out[c]/=alpha;out[3]=alpha;
};}
// 原像素梯度先形成张量再聚合，不能先降采样颜色而丢失细发丝方向。
function directions({data,width,height,maskWidth:mw,maskHeight:mh},coverage){
 const xx=new Float32Array(mw*mh),xy=new Float32Array(mw*mh),yy=new Float32Array(mw*mh),weights=new Float32Array(mw*mh),qx=new Float32Array(mw*mh),qy=new Float32Array(mw*mh);
 const at=(x,y,fallback)=>{x=clamp(x,0,width-1);y=clamp(y,0,height-1);const i=(y*width+x)*4;return data[i+3]&&coverage(x,y)?luma(data[i],data[i+1],data[i+2]):fallback;};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,weight=coverage(x,y)*data[i+3]/255;if(!weight)continue;
  const center=luma(data[i],data[i+1],data[i+2]),gx=(at(x+1,y,center)-at(x-1,y,center))*.5,gy=(at(x,y+1,center)-at(x,y-1,center))*.5,j=Math.min(mh-1,Math.floor((y+.5)*mh/height))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/width));
  xx[j]+=gx*gx*weight;xy[j]+=gx*gy*weight;yy[j]+=gy*gy*weight;weights[j]+=weight;
 }
 for(let i=0;i<weights.length;i++)if(weights[i]){xx[i]/=weights[i];xy[i]/=weights[i];yy[i]/=weights[i];}
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
  let a=0,b=0,c=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const j=clamp(y+dy,0,mh-1)*mw+clamp(x+dx,0,mw-1);a+=xx[j];b+=xy[j];c+=yy[j];}
  const trace=a+c+1e-6;qx[y*mw+x]=(a-c)/trace;qy[y*mw+x]=2*b/trace;
 }
 return {qx,qy};
}
function validateHairFrame(frame){
 const {data,width,height,mask,maskWidth:mw,maskHeight:mh}=frame||{};
 if(!(data instanceof Uint8Array)||![width,height,mw,mh].every(v=>Number.isSafeInteger(v)&&v>0)||width*height>80000000||data.length!==width*height*4||!(mask instanceof Uint8Array)||mask.length!==mw*mh||mw>1600||mh>1600)throw Error('发丝修饰图像或蒙版尺寸无效');
}
// 两项头发修饰共用已验证的原像素方向与逐邻居门控，不另建低清方向路径。
function createHairField(frame){
 validateHairFrame(frame);const {data,width,height,mask}=frame,fullMask=mask.every(v=>v>=240),coverage=fullMask?()=>1:(x,y)=>confidence(frame,width,height,x,y);
 return {coverage,read:sampler(data,width,height,coverage),...directions(frame,coverage)};
}
// 自主方向滤波：柔顺沿发丝，细节增强横向残差；两项不复用旧模型输出或合成公式。
function smoothHair(frame,settings){
 validateHairFrame(frame);const {data,width,height,maskWidth:mw,maskHeight:mh}=frame,{smoothPercent,detailPercent}=hairSettings(settings);
 const output=new Uint8Array(data);let changedRGBFields=0;if(!smoothPercent&&!detailPercent)return {output,changedRGBFields};
 const {coverage,read,qx,qy}=createHairField(frame),sample=new Float64Array(4),side=new Float64Array(4),radius=Math.max(1,Math.min(4,Math.max(width,height)/1400));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,gate=coverage(x,y);if(!gate||!data[i+3])continue;
  const mx=clamp(Math.round((x+.5)*mw/width-.5),0,mw-1),my=clamp(Math.round((y+.5)*mh/height-.5),0,mh-1),j=my*mw+mx,coherence=Math.hypot(qx[j],qy[j]),reliability=clamp((coherence-.25)/.5,0,1);if(!reliability)continue;
  const angle=.5*Math.atan2(qy[j],qx[j])+Math.PI/2,tx=Math.cos(angle),ty=Math.sin(angle);let sumR=0,sumG=0,sumB=0,weights=0;
  if(smoothPercent)for(let t=-3;t<=3;t++){
   const sx=x+t*tx*radius,sy=y+t*ty*radius,selection=coverage(sx,sy);if(!selection)continue;read(sx,sy,sample);
   const distance=((sample[0]-data[i])**2+(sample[1]-data[i+1])**2+(sample[2]-data[i+2])**2)/3,weight=(4-Math.abs(t))*Math.exp(-distance/(22*22))*selection*sample[3];sumR+=sample[0]*weight;sumG+=sample[1]*weight;sumB+=sample[2]*weight;weights+=weight;
  }
  let detail=0;if(detailPercent){const ax=x-ty*radius,ay=y+tx*radius,bx=x+ty*radius,by=y-tx*radius;
   if(coverage(ax,ay)>.6&&coverage(bx,by)>.6){read(ax,ay,sample);read(bx,by,side);if(sample[3]&&side[3])detail=clamp(luma(data[i],data[i+1],data[i+2])-(luma(...sample)+luma(...side))*.5,-10,10);}
  }
  const blend=smoothPercent/100*gate*reliability,boost=detail*detailPercent/100*gate*reliability,means=[sumR,sumG,sumB];
  for(let c=0;c<3;c++){const value=clamp(Math.round(data[i+c]+(weights?means[c]/weights-data[i+c]:0)*blend+boost),0,255);output[i+c]=value;if(value!==data[i+c])changedRGBFields++;}
 }
 return {output,changedRGBFields};
}
module.exports={smoothHair,hairSettings,validateHairFrame,createHairField};
