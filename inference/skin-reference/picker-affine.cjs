'use strict';
// 对应 LIVE 1425f42e0 的三点仿射求解（普通 display 三点供应）。
// 输入以F32存储读取、精确提升DOUBLE；消元/回代在DOUBLE域；输出再取F32。
// 求解 X=a*x+b*y+c、Y=d*x+e*y+f 的六元系数，即调用方交给 picker-coordinate 的 matrix。
const f=Math.fround;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const triples=p=>Array.isArray(p)&&p.length===3&&p.every(q=>(Array.isArray(q)||q instanceof Float64Array||q instanceof Float32Array)&&q.length===2&&finite(q[0])&&finite(q[1]));

function solveSuppliedPickerAffine({sourcePoints,targetPoints}={}){
 if(!triples(sourcePoints))throw TypeError('仿射求解需要三个有限F32源点');
 if(!triples(targetPoints))throw TypeError('仿射求解需要三个有限F32目标点');
 const sx=sourcePoints.map(p=>f(p[0])),sy=sourcePoints.map(p=>f(p[1]));
 const tx=targetPoints.map(p=>f(p[0])),ty=targetPoints.map(p=>f(p[1]));

 // 原版按行建立 6x7 增广矩阵，每行形如 [x, y, 1, 0, 0, 0 | X] 与 [0, 0, 0, x, y, 1 | Y]，
 // 列主元用绝对值比较；主元绝对值严格小于 2^-52 视为退化，输出当时RHS，不改成零或恒等。
 const M=[];
 for(let i=0;i<3;i++){
  M.push([sx[i],sy[i],1,0,0,0,tx[i]]);
  M.push([0,0,0,sx[i],sy[i],1,ty[i]]);
 }
 const n=6,rhs=6;
 const EPS=2.220446049250313e-16; // 原版 2^-52 严格下限
 let degenerate=false;
 for(let k=0;k<n;k++){
  // 选主元：在 [k,6) 中取 |M[r][k]| 最大者，严格大于才换行（原版 cmova/ja 语义）。
  let pivot=k,best=Math.abs(M[k][k]);
  for(let r=k+1;r<n;r++){const v=Math.abs(M[r][k]);if(v>best){best=v;pivot=r;}}
  if(best<EPS){degenerate=true;break;}
  if(pivot!==k){const t=M[k];M[k]=M[pivot];M[pivot]=t;}
  const d=M[k][k];
  for(let r=k+1;r<n;r++){
   const factor=M[r][k]/d;
   if(factor===0)continue;
   for(let c=k;c<=rhs;c++)M[r][c]=M[r][c]-M[k][c]*factor;
  }
 }
 let x;
 if(degenerate){
  // 原版退化路径输出当时RHS；保持有限、不伪造零或恒等。
  x=M.map(row=>row[rhs]);
 }else{
  x=new Array(n).fill(0);
  for(let i=n-1;i>=0;i--){
   let s=M[i][rhs];
   for(let j=i+1;j<n;j++)s=s-M[i][j]*x[j];
   x[i]=s/M[i][i];
  }
 }
 const co=Float64Array.from([f(x[0]),f(x[1]),f(x[2]),f(x[3]),f(x[4]),f(x[5])]);
 return {coefficients:co,degenerate};
}

module.exports={solveSuppliedPickerAffine};
