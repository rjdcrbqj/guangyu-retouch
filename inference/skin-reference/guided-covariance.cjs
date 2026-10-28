'use strict';
const f=Math.fround;
function finitePacked(data,fields){return data instanceof Float32Array&&data.length>0&&data.length%fields===0&&data.every(Number.isFinite);}

// Packed每像素means=[m0,m1,m2]；products及结果=[00,01,11,02,12,22]。
function covariance3({means,meanProducts,epsilon,rounding}={}){
 if(rounding!=='nearest-even'||!finitePacked(means,3)||!finitePacked(meanProducts,6)||meanProducts.length!==means.length*2||typeof epsilon!=='number'||!Number.isFinite(epsilon)||!Number.isFinite(f(epsilon)))throw TypeError('参考协方差需要完整有限packed均值/乘积和显式F32 epsilon/舍入');
 const out=new Float32Array(meanProducts.length),eps=f(epsilon);
 for(let i=0,j=0;i<means.length;i+=3,j+=6){
  const m0=means[i],m1=means[i+1],m2=means[i+2];
  out[j]=f(f(meanProducts[j]-f(m0*m0))+eps);
  out[j+1]=f(meanProducts[j+1]-f(m0*m1));
  out[j+2]=f(f(meanProducts[j+2]-f(m1*m1))+eps);
  out[j+3]=f(meanProducts[j+3]-f(m0*m2));
  out[j+4]=f(meanProducts[j+4]-f(m1*m2));
  out[j+5]=f(f(meanProducts[j+5]-f(m2*m2))+eps);
 }
 return out;
}

// 对应完整1463024a0，显式F32逐步运算；singular/中间溢出按IEEE传播，不增加det保护。
function inverseSymmetric3({triangle,rounding}={}){
 if(rounding!=='nearest-even'||!finitePacked(triangle,6))throw TypeError('参考三通道逆矩阵需要完整有限packed triangle和显式舍入');
 const out=new Float32Array(triangle.length);
 for(let i=0;i<triangle.length;i+=6){
  const a=triangle[i],b=triangle[i+1],d=triangle[i+2],c=triangle[i+3],e=triangle[i+4],z=triangle[i+5];
  const A=f(f(d*z)-f(e*e)),B=f(f(c*e)-f(b*z)),C=f(f(b*e)-f(c*d));
  const D=f(f(z*a)-f(c*c)),E=f(f(b*c)-f(e*a)),Z=f(f(d*a)-f(b*b));
  const det=f(f(f(a*A)+f(b*B))+f(c*C)),R=f(1/det);
  out[i]=f(A*R);out[i+1]=f(B*R);out[i+2]=f(D*R);out[i+3]=f(C*R);out[i+4]=f(E*R);out[i+5]=f(R*Z);
 }
 return out;
}
module.exports={covariance3,inverseSymmetric3};
