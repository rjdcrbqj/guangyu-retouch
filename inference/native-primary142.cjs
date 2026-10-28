'use strict';
// 原主142裁切与解码算术；检测框、trig和最终角度回调是显式外部边界。
function floatValues(value,length,message){const a=Array.isArray(value)?value.flat():Array.from(value??[]);if(a.length!==length||!a.every(v=>Number.isFinite(v)&&Number.isFinite(Math.fround(v))))throw new RangeError(message);return a;}
function matrix6(a){return floatValues(a,6,'原关键点仿射矩阵必须包含六个有限float32');}
const f=Math.fround,add=(a,b)=>f(f(a)+f(b)),mul=(a,b)=>f(f(a)*f(b)),sub=(a,b)=>f(f(a)-f(b));
function bboxAffine({bbox,nativeSin=0,nativeCos=1,margins=[.214,.214,.214,.214],side=160}){
 bbox=floatValues(bbox,4,'原主142需要有效像素检测框');margins=floatValues(margins,4,'原主142需要四个float32扩展比例');
 if(bbox[2]<=0||bbox[3]<=0||!Number.isInteger(side)||side<1||side>2048||![nativeSin,nativeCos].every(v=>Number.isFinite(v)&&Number.isFinite(f(v))))throw new RangeError('原主142裁切尺寸或trig无效');
 const [x,y,w,h]=bbox.map(f),s=f(nativeSin),c=f(nativeCos),[m0,m1,m2,m3]=margins.map(f);
 const high=[add(x,w),add(y,h)],half=[mul(sub(high[0],x),.5),mul(sub(high[1],y),.5)],center=[mul(add(x,high[0]),.5),mul(add(y,high[1]),.5)];
 const nx=f(-add(mul(w,.5),x)),ny=f(-add(mul(h,.5),y));
 const tx=add(add(mul(-s,ny),mul(c,nx)),0),ty=add(add(mul(nx,s),mul(ny,c)),0);
 const axes=[mul(c,half[0]),mul(s,half[0]),mul(-s,half[1]),mul(c,half[1])];
 const ec=[add(mul(c,center[0]),add(mul(-s,center[1]),tx)),add(mul(s,center[0]),add(mul(c,center[1]),ty))];
 const radius=[f(Math.sqrt(add(mul(axes[0],axes[0]),mul(axes[2],axes[2])))),f(Math.sqrt(add(mul(axes[1],axes[1]),mul(axes[3],axes[3]))))];
 const ew=sub(add(ec[0],radius[0]),sub(ec[0],radius[0])),eh=sub(add(ec[1],radius[1]),sub(ec[1],radius[1]));
 const p1=mul(m1,ew),p3=mul(m3,ew),p0=mul(m0,eh),p2=mul(m2,eh),sx=mul(sub(p1,p3),-.5),sy=mul(sub(p0,p2),-.5);
 const expanded=[add(add(p3,ew),p1),add(add(p2,eh),p0)],scale=Math.min(f(f(side)/expanded[0]),f(f(side)/expanded[1]));
 const target=[add(mul(side,.5),add(mul(0,sy),mul(scale,sx))),add(mul(side,.5),add(mul(0,sx),mul(scale,sy)))];
 return {affine:new Float32Array([mul(scale,c),mul(scale,-s),add(mul(scale,tx),target[0]),mul(scale,s),mul(scale,c),add(mul(scale,ty),target[1])]),ellipseBounds:[sub(ec[0],radius[0]),sub(ec[1],radius[1]),ew,eh],expandedExtent:expanded,scale};
}
// 采样矩阵修正半像素；坐标解码继续使用未修正矩阵的逆。
function samplingAffine(a){a=new Float32Array(matrix6(a));a[2]=add(sub(a[2],.5),add(mul(a[1],.5),mul(a[0],.5)));a[5]=add(sub(a[5],.5),add(mul(a[3],.5),mul(a[4],.5)));return a;}
function inverse(a){a=matrix6(a);const det=sub(mul(a[0],a[4]),mul(a[3],a[1])),r=det===0?0:f(1/det),ia=mul(a[4],r),ib=mul(-a[1],r),ic=mul(-a[3],r),id=mul(a[0],r);return new Float32Array([ia,ib,sub(mul(-ia,a[2]),mul(ib,a[5])),ic,id,sub(mul(-ic,a[2]),mul(id,a[5]))]);}
function sampleRawBGR({rgb,width,height,affine,side=160}){
 if(!(rgb instanceof Uint8Array)||!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||rgb.length!==width*height*3||!Number.isInteger(side)||side<1||side>2048)throw new RangeError('原关键点采样需要有效RGB照片与目标边长');
 const inv=inverse(affine),out=new Float32Array(3*side*side);let valid=0;
 for(let y=0;y<side;y++){let sx=y*inv[1]+inv[2],sy=y*inv[4]+inv[5];for(let x=0;x<side;x++){
  const ix=Math.floor(sx),iy=Math.floor(sy);
  if(ix>=0&&iy>=0&&ix<width-1&&iy<height-1){
   const fx=f(sx-ix),fy=f(sy-iy),ox=sub(1,fx),oy=sub(1,fy),weights=[mul(fx,fy),mul(ox,fy),mul(ox,oy),mul(oy,fx)],offsets=[((iy+1)*width+ix+1)*3,((iy+1)*width+ix)*3,(iy*width+ix)*3,(iy*width+ix+1)*3];
   // 原完整1446d03a0：先TL+TR，再BL，最后BR；每步独立F32舍入。
   for(let ch=0;ch<3;ch++){let v=add(mul(rgb[offsets[2]+2-ch],weights[2]),mul(rgb[offsets[3]+2-ch],weights[3]));v=add(v,mul(rgb[offsets[1]+2-ch],weights[1]));v=add(v,mul(rgb[offsets[0]+2-ch],weights[0]));out[ch*side*side+y*side+x]=v;}
   valid++;
  }
  sx+=inv[0];sy+=inv[3];
 }}return {input:out,validPixels:valid};
}


// 原SSE点组均值与插值顺序；没有回调时不伪造原数学库返回值。
const rules=[[[60,61],59,62],[[67,68],66,69],[[84],83,85],[[86],85,87],[[88],87,89],[[90],89,91],[[92],91,93],[[94],73,93],[[107,108],89,125]];
const groups=[[18,19,20,21,22,23,24,25,35,27,31],[36,37,38,39,40,41,42,43,53,45,49]];
function interpolate(data,cols=1){const p=Float32Array.from(data);for(const[ids,a,b]of rules)for(let i=0;i<ids.length;i++)for(let c=0;c<cols;c++)p[ids[i]*cols+c]=f(p[a*cols+c]+f(f(f(p[b*cols+c]-p[a*cols+c])*f(i+1))/f(ids.length+1)));return p;}
function sum11(a,alignment){const peel=(-(alignment/4))&3;const v=Array.from({length:4},(_,i)=>f(a[peel+4+i]+a[peel+i]));let s=f(f(v[3]+v[1])+f(v[2]+v[0]));for(let i=0;i<peel;i++)s=f(s+a[i]);for(let i=peel+8;i<11;i++)s=f(s+a[i]);return s;}
function angleArguments(points,bufferAlignment=0){points=Float32Array.from(floatValues(points,284,'原142角度需要284个有限坐标'));if(![0,4,8,12].includes(bufferAlignment))throw new RangeError('原角度点组对齐必须是0/4/8/12');const means=groups.map(ids=>[0,1].map(c=>f(sum11(ids.map(i=>points[i*2+c]),(bufferAlignment+c*44)&15)/f(11))));return Float32Array.from([f(means[1][1]-means[0][1]),f(means[1][0]-means[0][0])]);}
function decode({output287,output1627,output2032,nativeInverseFloat32,pointConfidenceEnabled=false,nativeAngleCallback,bufferAlignment=0}){output287=floatValues(output287,284,'原主142坐标输出无效');output1627=floatValues(output1627,2,'原主142分数输出无效');if(pointConfidenceEnabled)output2032=floatValues(output2032,142,'原主142点置信输出无效');if(![0,4,8,12].includes(bufferAlignment))throw new RangeError('原角度点组对齐必须是0/4/8/12');const inv=matrix6(nativeInverseFloat32);const q=new Float32Array(284);for(let i=0;i<142;i++){const x=f(f(output287[2*i])*f(160)),y=f(f(output287[2*i+1])*f(160));for(let c=0;c<2;c++)q[i*2+c]=f(f(f(y*f(inv[c*3+1]))+f(x*f(inv[c*3])))+f(inv[c*3+2]));}const points=interpolate(q,2),args=angleArguments(points,bufferAlignment);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let i=0;i<142;i++){minX=Math.min(minX,points[i*2]);minY=Math.min(minY,points[i*2+1]);maxX=Math.max(maxX,points[i*2]);maxY=Math.max(maxY,points[i*2+1]);}return{points,confidence:pointConfidenceEnabled?interpolate(output2032):null,score:f(output1627[1]),bbox:Float32Array.from([minX,minY,f(maxX-minX),f(maxY-minY)]),angleArgumentsYX:args,angle:nativeAngleCallback===undefined?null:f(nativeAngleCallback(...args))};}


module.exports={bboxAffine,samplingAffine,inverse,sampleRawBGR,decode,interpolate,angleArguments};

