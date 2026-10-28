'use strict';
const primary=require('./native-primary142.cjs'),f=Math.fround;
const rules=[...Array.from({length:12},(_,i)=>[[24+2*i],23+2*i,25+2*i]),[[49],48,50],[[51],50,11]];
function finiteValues(value,length){const a=Array.isArray(value)?value.flat():Array.from(value??[]);if(a.length!==length||!a.every(v=>Number.isFinite(v)&&Number.isFinite(f(v))))throw new RangeError('原辅助52需要有限float32坐标或仿射矩阵');return Float32Array.from(a);}
// 原1445132f0保存未经半像素修正的逆矩阵；只支持有限非退化输入。
function nativeInverse(a){a=finiteValues(a,6);const det=f(f(a[0]*a[4])-f(a[3]*a[1]));if(det===0||!Number.isFinite(det))throw new RangeError('原辅助52仿射矩阵退化');const r=f(1/det),ia=f(a[4]*r),ib=f(-a[1]*r),ic=f(-a[3]*r),id=f(a[0]*r);return Float32Array.from([ia,ib,f(f(-ia*a[2])-f(a[5]*ib)),ic,id,f(f(-ic*a[2])-f(a[5]*id))]);}
// 原target0x300：FLOAT BGR原值，side128，不经过BYTE量化或归一化。
function prepare({rgb,width,height,nativeAffineFloat32}){const affine=finiteValues(nativeAffineFloat32,6),decodeInverse=nativeInverse(affine),samplingAffine=primary.samplingAffine(affine),{input,validPixels}=primary.sampleRawBGR({rgb,width,height,affine:samplingAffine,side:128});return{input,affine,decodeInverse,samplingAffine,validPixels};}
// 原output50已是裁切像素；各乘、加、平移与14条插值逐步舍入为float32。
function decode({output50,nativeDecodeInverseFloat32}){output50=finiteValues(output50,104);const inv=finiteValues(nativeDecodeInverseFloat32,6),p=new Float32Array(104);for(let i=0;i<52;i++){const x=output50[2*i],y=output50[2*i+1];for(let c=0;c<2;c++)p[2*i+c]=f(f(f(x*inv[c*3])+f(y*inv[c*3+1]))+inv[c*3+2]);}for(const[ids,a,b]of rules)for(let i=0;i<ids.length;i++)for(let c=0;c<2;c++)p[ids[i]*2+c]=f(p[a*2+c]+f(f(f(p[b*2+c]-p[a*2+c])*f(i+1))/f(ids.length+1)));return p;}
module.exports={nativeInverse,prepare,decode};
