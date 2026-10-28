'use strict';
const f=Math.fround,maxDimLimit=32766;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const point2=p=>(Array.isArray(p)||p instanceof Float64Array||p instanceof Float32Array)&&p.length===2&&finite(p[0])&&finite(p[1]);
const matrix6=m=>(Array.isArray(m)||m instanceof Float64Array||m instanceof Float32Array)&&m.length===6&&Array.from(m).every(finite);

// 原版普通取色的F32仿射顺序：X=F32(F32(y*b)+F32(F32(x*a)+c))，Y=F32(F32(y*e)+F32(F32(x*d)+f))。
// 调用方必须提供真实matrix与cap；本模块不制造默认矩阵或默认上限。
function applySuppliedPickerAffine({point,matrix,cap,displayWH}={}){
 if(!point2(point))throw TypeError('取色坐标需要两个有限F32点');
 if(!matrix6(matrix))throw TypeError('取色坐标需要六元有限F32矩阵');
 const [x,y]=point,[a,b,c,d,e,g]=matrix;
 let px=f(f(y*b)+f(f(x*a)+c)),py=f(f(y*e)+f(f(x*d)+g));
 let scale=1,capApplied=false;
 if(cap!==undefined){
  if(!Number.isSafeInteger(cap)||cap<1||cap>maxDimLimit)throw RangeError('取色坐标上限必须是1..32766整数');
  if(!Array.isArray(displayWH)&&!(displayWH instanceof Int32Array))throw RangeError('应用上限时必须提供显示宽高');
  if(displayWH.length!==2||!Number.isSafeInteger(displayWH[0])||!Number.isSafeInteger(displayWH[1])||
   displayWH[0]<1||displayWH[1]<1||displayWH[0]>maxDimLimit||displayWH[1]>maxDimLimit)
   throw RangeError('显示宽高必须是1..32766整数');
  // 仅当较长边严格超过cap时缩放；比值先F32，再分别乘两轴。
  if(Math.max(displayWH[0],displayWH[1])>cap){scale=f(cap/Math.max(displayWH[0],displayWH[1]));px=f(px*scale);py=f(py*scale);capApplied=true;}
 }
 return {point:Float64Array.from([px,py]),scale,capApplied};
}

// 整数转换：v>=0用CVTT(F32(v+.5))；v<0先t=F32(v-1)、i=CVTT(t)、q=F32(i)，再i+CVTT(F32(F32(v-q)+.5))。
// 仅限正常有限有效域；不定义NaN、溢出或未知MXCSR合同。
function toSuppliedPickerInteger(v){
 if(!finite(v))throw TypeError('取色坐标整数转换需要有限数');
 if(v>=0)return Math.trunc(f(v+.5));
 const t=f(v-1),i=Math.trunc(t),q=f(i);
 return i+Math.trunc(f(f(v-q)+.5));
}

module.exports={applySuppliedPickerAffine,toSuppliedPickerInteger};
