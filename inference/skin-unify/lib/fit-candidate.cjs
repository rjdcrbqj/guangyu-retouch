'use strict';
// Research candidate: fixed 2-D / row counts, original SSE F32 operation order.
// No product import and no closed-form rotation/least-squares substitution.
const f = Math.fround;
const add=(a,b)=>f(a+b), sub=(a,b)=>f(a-b), mul=(a,b)=>f(a*b), div=(a,b)=>f(a/b), sqrt=a=>f(Math.sqrt(a));
const MIN_NORMAL=1.1754943508222875e-38, TWO_EPS=2.384185791015625e-7;
function meansAndCovariance(source,target,selected5=false) {
  const n=source.length;
  if(![5,33,142,194].includes(n)||target.length!==n) throw new RangeError('Explicit equal rows 5/33/142/194 required');
  const p=source.map(r=>r.map(f)),q=target.map(r=>r.map(f));
  for(const a of [p,q])for(const r of a)if(r.length!==2||!r.every(Number.isFinite))throw new TypeError('Finite row-major Nx2 required');
  const invN=div(1,f(n));
  const mean=a=>[0,1].map(j=>{let s=a[0][j];for(let i=1;i<n;i++)s=add(s,a[i][j]);return mul(s,invN);});
  const sourceMean=mean(p),targetMean=mean(q);
  if(selected5){
    if(n!==5)throw new RangeError('Selected5 specialization requires5 source rows');
    //144507405..14450761c, source selector is columnmajor16-byte-aligned.
    //x column is aligned: four-lane horizontal sum and scalar fifth point.
    //y column starts+20: three scalar prefix coordinates then two scalar tail.
    sourceMean[0]=mul(add(add(add(p[3][0],p[1][0]),add(p[2][0],p[0][0])),p[4][0]),invN);
  }
  const centeredSource=p.map(r=>r.map((x,j)=>sub(x,sourceMean[j])));
  const centeredTarget=q.map(r=>r.map((x,j)=>sub(x,targetMean[j])));
  const covariance=[0,1].map(a=>[0,1].map(b=>{
    let s=0;
    if(n===5){
      //1445148e4: outputRows+outputCols+K <=19 -> small product.
      //144514b79..b8a SIMD horizontal reduction, then scalar tail row4.
      const p=[0,1,2,3].map(i=>mul(centeredTarget[i][a],centeredSource[i][b]));
      s=add(add(p[3],p[1]),add(p[2],p[0]));
      s=add(s,mul(centeredTarget[4][a],centeredSource[4][b]));
    }else for(let i=0;i<n;i++)s=add(s,mul(centeredTarget[i][a],centeredSource[i][b]));
    return mul(s,invN);
  }));
  return {sourceMean,targetMean,centeredSource,centeredTarget,covariance,invN};
}
function svd2(candidateCovariance) {
  const input=candidateCovariance.map(r=>r.map(f));
  if(input.length!==2||input.some(r=>r.length!==2||!r.every(Number.isFinite)))throw new TypeError('Finite logical 2x2 covariance required');
  let scale=Math.max(...input.flat().map(Math.abs));if(scale===0)scale=1;
  const m=input.map(r=>r.map(v=>div(v,scale))),U=[[1,0],[0,1]],V=[[1,0],[0,1]];
  let diagMax=Math.max(Math.abs(m[0][0]),Math.abs(m[1][1])),iterations=0;
  for(;;){
    const threshold=Math.max(mul(diagMax,TWO_EPS),MIN_NORMAL);
    if(!(Math.abs(m[1][0])>threshold||Math.abs(m[0][1])>threshold))break;
    if(++iterations>64)throw new Error('Research Jacobi bound reached');
    const a=m[0][0],b=m[0][1],c=m[1][0],d=m[1][1],t=sub(b,c);
    let leftS=0,leftC=1;
    if(!(MIN_NORMAL>Math.abs(t))){
      const u=div(add(d,a),t),root=sqrt(add(mul(u,u),1));
      leftS=div(1,root);leftC=div(u,root);
    }
    const diagD=add(mul(d,leftC),mul(b,leftS));
    const diagA=add(mul(c,-leftS),mul(a,leftC));
    const off=add(mul(leftC,c),mul(a,leftS)),absOff=Math.abs(off),twice=add(absOff,absOff);
    let rightS=0,rightC=1;
    if(!(MIN_NORMAL>twice)){
      const tau=div(sub(diagD,diagA),twice),w=sqrt(add(mul(tau,tau),1));
      const z=div(1,add(tau,tau>0?w:-w));
      rightC=div(1,sqrt(add(mul(z,z),1)));
      const signOff=div(off,absOff),signed=z>0?-signOff:signOff;
      rightS=mul(mul(Math.abs(z),signed),rightC);
    }
    const totalC=add(mul(leftC,rightC),mul(leftS,rightS));
    const totalS=add(mul(leftC,-rightS),mul(leftS,rightC));
    // Original 144519310/4c0: columns and rows retain separate mul/add roundings.
    if(totalC!==1||totalS!==0){
      for(let j=0;j<2;j++){
        const x=m[0][j],y=m[1][j];
        m[1][j]=add(mul(totalC,y),mul(totalS,x));
        m[0][j]=add(mul(y,-totalS),mul(x,totalC));
      }
      for(let j=0;j<2;j++){
        const x=U[j][0],y=U[j][1];
        U[j][1]=add(mul(totalC,y),mul(totalS,x));
        U[j][0]=add(mul(y,-totalS),mul(x,totalC));
      }
    }
    if(rightS!==0||rightC!==1){
      for(const a of [m,V])for(let i=0;i<2;i++){
        const x=a[i][0],y=a[i][1];
        a[i][1]=add(mul(rightC,y),mul(x,-rightS));
        a[i][0]=add(mul(y,rightS),mul(x,rightC));
      }
    }
    diagMax=Math.max(Math.abs(m[0][0]),Math.abs(m[1][1]),diagMax);
  }
  const singularValues=[0,1].map(i=>Math.abs(m[i][i]));
  for(let i=0;i<2;i++)if(m[i][i]<0)for(let j=0;j<2;j++)U[j][i]=-U[j][i];
  for(let i=0;i<2;i++)singularValues[i]=mul(singularValues[i],scale);
  if(singularValues[1]>singularValues[0]){
    singularValues.reverse();
    for(const a of [U,V])for(const r of a)r.reverse();
  }
  return {U,V,singularValues,iterations};
}
function determinantOriginal(matrix) {
  const input=matrix.map(r=>r.map(f));
  if(input.length!==2||input.some(r=>r.length!==2||!r.every(Number.isFinite)))throw new TypeError('Finite logical2x2 required');
  let [[a,b],[c,d]]=input,sign=1;
  //1445233e8 strict max-abs pivot in first column; equal magnitude retains row0.
  if(Math.abs(c)>Math.abs(a)){[a,b,c,d]=[c,d,a,b];sign=-1;}
  //1445234e0 division and144523560 separate product/subtraction.
  if(a!==0)c=div(c,a);
  d=sub(d,mul(c,b));
  //144521140,14452114f..153: product first, signed parity multiply second.
  return mul(mul(a,d),sign);
}
const meansAndCovarianceSelected5=(source,target)=>meansAndCovariance(source,target,true);
module.exports={meansAndCovariance,meansAndCovarianceSelected5,svd2,determinantOriginal};
