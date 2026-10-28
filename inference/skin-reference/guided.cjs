'use strict';
const {guidedMean}=require('./guided-mean.cjs');
const {covariance3,inverseSymmetric3}=require('./guided-covariance.cjs');
const f=Math.fround;
const PAIRS=[[0,0],[0,1],[1,1],[0,2],[1,2],[2,2]];

// 组合原guided九步数学，仅处理已供应的packed BYTE3 guide/mono source。
function guidedRefineBYTE3(r){
 if(!r||r.rounding!=='nearest-even'||!Number.isInteger(r.width)||!Number.isInteger(r.height)||
  r.width<5||r.height<5||r.width>1500||r.height>1500||!Number.isInteger(r.radius)||r.radius<1||r.radius>15)
  throw TypeError('guided需要明确nearest-even及WH5..1500/radius1..15');
 const {guide,source,width,height,radius}=r,n=width*height;
 if(!(guide instanceof Uint8Array)||guide.length!==n*3||!(source instanceof Uint8Array)||source.length!==n)
  throw TypeError('guided输入必须是packed BYTE3与mono BYTE');
 const I=Array.from({length:3},()=>new Uint8Array(n));
 for(let at=0;at<n;at++)for(let c=0;c<3;c++)I[c][at]=guide[at*3+c]; // 保持物理通道顺序。
 const mean=(data,depth)=>guidedMean({data,width,height,radius,depth});
 const m=I.map(data=>mean(data,0)),mp=mean(source,0);
 const means=new Float32Array(n*3),meanProducts=new Float32Array(n*6);
 for(let at=0;at<n;at++)for(let c=0;c<3;c++)means[at*3+c]=m[c][at];
 for(let t=0;t<6;t++){
  const [i,j]=PAIRS[t],product=new Uint16Array(n);
  for(let at=0;at<n;at++)product[at]=I[i][at]*I[j][at];
  const values=mean(product,2);
  for(let at=0;at<n;at++)meanProducts[at*6+t]=values[at];
 }
 const triangle=covariance3({means,meanProducts,epsilon:65.0250015258789,rounding:'nearest-even'});
 const inverse=inverseSymmetric3({triangle,rounding:'nearest-even'});
 const cov=I.map((data,c)=>{
  const product=new Uint16Array(n);
  for(let at=0;at<n;at++)product[at]=source[at]*data[at];
  const values=mean(product,2);
  for(let at=0;at<n;at++)values[at]=f(values[at]-f(mp[at]*m[c][at]));
  return values;
 });
 const a=Array.from({length:3},()=>new Float32Array(n)),b=new Float32Array(mp);
 for(let at=0;at<n;at++){
  for(let i=0;i<3;i++){
   const index=j=>Math.max(i,j)*(Math.max(i,j)+1)/2+Math.min(i,j);
   let value=f(inverse[at*6+index(0)]*cov[0][at]);
   for(let j=1;j<3;j++)value=f(value+f(inverse[at*6+index(j)]*cov[j][at]));
   a[i][at]=value; // 起始乘积，再按j1/j2相加；禁止合并乘加。
  }
  for(let i=0;i<3;i++)b[at]=f(b[at]-f(a[i][at]*m[i][at]));
 }
 const A=a.map(data=>mean(data,5)),B=mean(b,5),output=new Uint8Array(n);
 for(let at=0;at<n;at++){
  let q=B[at];
  for(let i=0;i<3;i++)q=f(q+f(A[i][at]*I[i][at]));
  if(!Number.isFinite(q)||Math.abs(q)>=2**30)throw RangeError('guided超出已验证的有限cast子域');
  const lo=Math.floor(q),part=q-lo;
  const nearest=lo+(part>.5||(part===.5&&lo%2!==0)?1:0);
  output[at]=Math.max(0,Math.min(255,nearest)); // 直接BYTE单位，无额外255倍乘。
 }
 return output;
}
module.exports={guidedRefineBYTE3};
