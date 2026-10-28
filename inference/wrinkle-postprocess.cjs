'use strict';
// 原祛皱后处理研究实现；不包含关键点、区域生成、辅助模型或生产APP接入。
const f=Math.fround;
function checkFloat(v,n,name){if(!(v instanceof Float32Array)||v.length!==n||!v.every(Number.isFinite))throw new RangeError(name+' shape/finite');}
function checkByte(v,n,name){if(!(v instanceof Uint8Array)||v.length!==n)throw new RangeError(name+' shape');}
function shape(w,h){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1)throw new RangeError('dimensions');return w*h;}
function roundEven(x){const l=Math.floor(x),d=x-l;return d<.5?l:d>.5?l+1:l+(l%2);}
// 1446b2450 -> VT149127c20+10=1446c41c0：CHW照片输出减原byte，再乘已含强度的mixedMask。
function weightedResidual({modelCHW,source,mixedMask,width,height,channels=3}){
 const n=shape(width,height);if(![3,4].includes(channels))throw new RangeError('channels');checkFloat(modelCHW,n*3,'model');checkByte(source,n*channels,'source');checkFloat(mixedMask,n,'mixedMask');
 const out=new Float32Array(n*3);
 for(let i=0;i<n;i++)for(let c=0;c<3;c++)out[3*i+c]=f(f(modelCHW[c*n+i]-source[channels*i+c])*mixedMask[i]);
 return out;
}
// 1446c54f0/145ab93f0：偏移80、饱和编码、79..81合并为80。CPU模式必须由调用方显式选择。
function encodeResidual({residual,width,height,cpuMode}){
 const n=shape(width,height);checkFloat(residual,n*3,'residual');if(!['scalar','avx2'].includes(cpuMode))throw new RangeError('cpuMode must be scalar or avx2; SSE not certified');
 const out=new Uint8Array(n*3),row=width*3,vectorEnd=cpuMode==='avx2'&&width>=11?Math.floor(row/32)*32:0;
 for(let y=0;y<height;y++)for(let x=0;x<row;x++){
  const z=f(residual[y*row+x]+80);let q=x<vectorEnd?roundEven(z):Math.trunc(z+.5);q=Math.max(0,Math.min(255,q));out[y*row+x]=(q>=79&&q<=81)?80:q;
 }
 return out;
}
// 1445132f0：保留float32运算次序；输入为ROI→模型坐标的原2×3矩阵。
function inverseAffine(matrix){
 checkFloat(matrix,6,'affine');const [a,b,c,d,e,g]=matrix,det=f(f(a*e)-f(d*b));if(!det)throw new RangeError('singular affine');const q=f(1/det),o=new Float32Array([f(e*q),f(-b*q),0,f(-d*q),f(a*q),0]);o[2]=f(f(-o[0]*c)-f(g*o[1]));o[5]=f(f(-o[3]*c)-f(g*o[4]));return o;
}
// 145bdad50→145be1380→1446b5330：当前照片+已逆变换byte残差-80；alpha原样保留。
function applyEncoded({source,width,height,channels=3,encoded,roi,override=null,cpuMode='scalar'}){
 const n=shape(width,height);if(![3,4].includes(channels))throw new RangeError('channels');checkByte(source,n*channels,'source');
 if(!['scalar','avx2'].includes(cpuMode))throw new RangeError('cpuMode');
 if(!Array.isArray(roi)||roi.length!==4||!roi.every(Number.isInteger))throw new RangeError('roi');const [left,top,w,h]=roi,localN=shape(w,h);if(left<0||top<0||left+w>width||top+h>height)throw new RangeError('roi bounds');checkByte(encoded,localN*3,'encoded');
 if(override){checkByte(override.byteImage,localN*3,'native +130 byteImage');checkFloat(override.confidence,localN,'native +190 confidence');if(!Number.isFinite(override.threshold)||!Number.isFinite(override.countRatio)||typeof override.native226Flag!=='boolean')throw new RangeError('override native metadata');}
 const output=new Uint8Array(source),gray=new Uint8Array(localN),changedMask=new Uint8Array(localN),magnitude=new Uint8Array(localN);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,k=((top+y)*width+left+x)*channels;
  // 1446b81a0/1446b8030灰度整数权重：BGR=.114/.587/.299。
  const lum=(encoded[3*i]*0xe97+encoded[3*i+1]*0x4b23+encoded[3*i+2]*0x2646+0x4000)>>15;gray[i]=lum;
  // scalar上下界half-up为80/81；AVX2的ROUND在默认MXCSR下为80/80。
  changedMask[i]=(lum<80||lum>(cpuMode==='scalar'?81:80))?255:0;magnitude[i]=Math.abs(lum-80);
  for(let c=0;c<3;c++)output[k+c]=Math.max(0,Math.min(255,source[k+c]+encoded[3*i+c]-80));
 }
 // 原条件覆盖保留非对称边界：y=1..h-2、x=0..w-3；不猜+130来源。
 const active=!!override&&!override.native226Flag&&override.countRatio<.5&&Math.min(w,h)/1536<2.7&&w>2&&h>2;
 if(active)for(let y=1;y<h-1;y++)for(let x=0;x<w-2;x++){const i=y*w+x,k=((top+y)*width+left+x)*channels;if(override.confidence[i]>=override.threshold)for(let c=0;c<3;c++)output[k+c]=override.byteImage[3*i+c];}
 return {output,gray,changedMask,magnitude,overrideApplied:active};
}
// 145bc3240逐脸apply；保留顺序量化/饱和，不能替换为max强度选择或一次求和。
function applyFaces({source,width,height,channels=3,faces,cpuMode='scalar'}){if(!Array.isArray(faces))throw new RangeError('faces');let output=new Uint8Array(source);const reports=[];for(const face of faces){const r=applyEncoded({source:output,width,height,channels,cpuMode,...face});output=r.output;reports.push({overrideApplied:r.overrideApplied});}return {output,reports};}
// 原逆变换矩阵先按float32计算；OpenCV再以double求逆进行dest→source采样。
// INTER_LINEAR采用1/32坐标表与1/1024权重，常量边界为残差编码零点80。
function warpEncodedToROI({encoded,width,height,forwardAffine,roiWidth,roiHeight}){
 const n=shape(width,height);checkByte(encoded,n*3,'encoded');shape(roiWidth,roiHeight);
 const inv=inverseAffine(forwardAffine),[a,b,c,d,e,g]=inv,det=a*e-b*d,q=1/det;
 const m=[e*q,-b*q,0,-d*q,a*q,0];m[2]=-m[0]*c-m[1]*g;m[5]=-m[3]*c-m[4]*g;
 const out=new Uint8Array(roiWidth*roiHeight*3),dx=new Int32Array(roiWidth),dy=new Int32Array(roiWidth);
 for(let x=0;x<roiWidth;x++){dx[x]=roundEven(m[0]*x*1024);dy[x]=roundEven(m[3]*x*1024);}
 const at=(x,y,ch)=>x<0||x>=width||y<0||y>=height?80:encoded[(y*width+x)*3+ch];
 for(let y=0;y<roiHeight;y++){
  const ox=roundEven((m[1]*y+m[2])*1024)+16,oy=roundEven((m[4]*y+m[5])*1024)+16;
  for(let x=0;x<roiWidth;x++){
   const xx=(ox+dx[x])>>5,yy=(oy+dy[x])>>5,sx=xx>>5,sy=yy>>5,fx=xx&31,fy=yy&31;
   const weights=[(32-fx)*(32-fy),fx*(32-fy),(32-fx)*fy,fx*fy];
   for(let ch=0;ch<3;ch++)out[(y*roiWidth+x)*3+ch]=(at(sx,sy,ch)*weights[0]+at(sx+1,sy,ch)*weights[1]+at(sx,sy+1,ch)*weights[2]+at(sx+1,sy+1,ch)*weights[3]+512)>>10;
  }
 }
 return out;
}
module.exports={weightedResidual,encodeResidual,inverseAffine,applyEncoded,applyFaces,warpEncodedToROI};
