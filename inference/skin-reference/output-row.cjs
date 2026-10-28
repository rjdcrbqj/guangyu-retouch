'use strict';
const f=Math.fround,AREA=768*768,inv255=f(1/255);
function finite(data,size){return data instanceof Float32Array&&data.length===size&&data.every(Number.isFinite);}

// 按系数网格供应工作缓冲，保留模型mask归一化后的负值。
function prepareReferenceHeads(heads){
 if(!finite(heads?.coefficients,9*AREA)||!finite(heads?.mask,AREA))throw TypeError('参考模型输出尺寸或数值无效');
 const normalizedMask=new Float32Array(AREA);
 for(let i=0;i<AREA;i++)normalizedMask[i]=f(f(heads.mask[i]+1)*.5);
 return {coefficients:heads.coefficients.slice(),normalizedMask,bias:new Float32Array(3*AREA),secondResidual:new Float32Array(AREA)};
}

// 对绝对原图坐标使用分步F32仿射与原有限边界采样规则。
function coordinates(affine,x,y){
 const [a,b,c,d,e,g]=affine,sx=f(f(f(a*f(x))+f(b*f(y)))+c),sy=f(f(f(d*f(x))+f(e*f(y)))+g);
 if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=-2147483648||sx>=2147483648||sy<=-2147483648||sy>=2147483648)throw RangeError('参考图坐标超出已验证的整数转换范围');
 function axis(v){
  const lo=Math.max(0,Math.min(767,Math.trunc(v)));
  if(v>0&&v<767){const hi=Math.max(0,Math.min(767,Math.trunc(f(v+1))));return [lo,hi,f(hi-v)];}
  return [lo,lo,1];
 }
 const [x0,x1,wx]=axis(sx),[y0,y1,wy]=axis(sy);
 return {indices:[y0*768+x0,y0*768+x1,y1*768+x0,y1*768+x1],wx,wy};
}

// planeOffset避免逐像素创建整幅平面副本；舍入次序来自原标量leaf。
function bilinear(data,planeOffset,sample){
 const [tl,tr,bl,br]=sample.indices,wx=sample.wx,wy=sample.wy,ix=f(1-wx),iy=f(1-wy);
 const top=f(f(data[planeOffset+tl]*wx)+f(data[planeOffset+tr]*ix));
 const bottom=f(f(data[planeOffset+bl]*wx)+f(data[planeOffset+br]*ix));
 return f(f(top*wy)+f(bottom*iy));
}

// 先验证整次作业，再执行packed3 ROI；强度和最终blend属于后续独立阶段。
function applyReferenceRows(r){
 if(!r)throw TypeError('参考贴回参数不完整');
 const {source,width,height,stride,channels,ROI,postAffine,pixelMask,maskStride,work}=r;
 if(!(source instanceof Uint8Array)||![width,height,stride].every(Number.isSafeInteger)||
  width<2||height<2||width>32766||height>32766||width*height>80000000||![3,4].includes(channels)||
  stride<width*channels||stride*height>source.length)throw TypeError('参考贴回原图缓冲无效');
 if(!Array.isArray(ROI)||ROI.length!==4||!ROI.every(Number.isInteger)||ROI[0]<0||ROI[1]<0||
  ROI[2]<0||ROI[3]<0||ROI[2]>4096||ROI[3]>4096||ROI[0]+ROI[2]>width||ROI[1]+ROI[3]>height)throw TypeError('参考贴回区域无效');
 const [x,y,w,h]=ROI,begin=r.startRow??0,end=r.endRow??h;
 if(![begin,end].every(Number.isInteger)||begin<0||end<begin||end>h||
  !(pixelMask instanceof Uint8Array)||!Number.isSafeInteger(maskStride)||maskStride<w||maskStride*h>pixelMask.length||
  !finite(postAffine,6)||!finite(work?.coefficients,9*AREA)||!finite(work?.normalizedMask,AREA)||
  !finite(work?.bias,3*AREA)||!finite(work?.secondResidual,AREA))throw TypeError('参考贴回蒙版、行范围或工作缓冲无效');
 const processed=new Uint8Array(w*h*3);
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  const src=(y+row)*stride+(x+col)*channels,dst=(row*w+col)*3;
  processed.set(source.subarray(src,src+3),dst);
 }
 for(let row=begin;row<end;row++)for(let col=0;col<w;col++){
  if(!pixelMask[row*maskStride+col])continue;
  const sample=coordinates(postAffine,x+col,y+row),alpha=bilinear(work.normalizedMask,0,sample),beta=bilinear(work.secondResidual,0,sample);
  if(!(alpha>0||beta>0))continue;
  const src=(y+row)*stride+(x+col)*channels,dst=(row*w+col)*3;
  const c0=f(source[src]*inv255),c1=f(source[src+1]*inv255),c2=f(source[src+2]*inv255);
  for(let ch=0;ch<3;ch++){
   const base=ch*3*AREA,k0=bilinear(work.coefficients,base,sample),k1=bilinear(work.coefficients,base+AREA,sample),k2=bilinear(work.coefficients,base+2*AREA,sample);
   const bias=bilinear(work.bias,ch*AREA,sample),sum=f(f(f(k2*c2)+f(k0*c0))+f(k1*c1));
   const delta=f(f(sum*alpha)+f(bias*beta)),value=delta*255+source[src+ch];
   if(!Number.isFinite(value)||value<=-2147483648||value>=2147483648)throw RangeError('参考贴回超出已验证的整数转换范围');
   processed[dst+ch]=Math.max(0,Math.min(255,Math.trunc(value)));
  }
 }
 return {processed,stride:w*3};
}
module.exports={prepareReferenceHeads,applyReferenceRows};
