'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const modulePath='../inference/skin-reference/picker-coordinate.cjs';
const f=Math.fround;

// 原版系数顺序：X=F32(F32(y*b)+F32(F32(x*a)+c))，Y=F32(F32(y*e)+F32(F32(x*d)+f))。
// 这三个fixture在单次舍入实现下会得到不同F32位型，能抓住错误结合顺序。
test('picker coordinate applies the two-step F32 affine order rather than one rounding',()=>{
 const {applySuppliedPickerAffine:run}=require(modulePath);
 const matrix=[.1,.3,.7,.1,.3,.7];
 const a=run({point:[.1,.1],matrix});
 assert.equal(a.point[0],0.7399999499320984);
 assert.equal(a.point[1],0.7399999499320984);
 assert.notEqual(a.point[0],f(.1*.1+.7+.1*.3));
 const b=run({point:[.1,.1],matrix:[.1,2.3,17.29,.1,2.3,17.29]});
 assert.equal(b.point[0],17.529998779296875);
 assert.equal(b.point[1],17.529998779296875);
 const c=run({point:[.1,.1],matrix:[1.3,.3,.7,1.3,.3,.7]});
 assert.equal(c.point[0],0.85999995470047);
 assert.equal(c.point[1],0.85999995470047);
});

test('picker coordinate identity keeps the caller F32 point and does not cap without a cap',()=>{
 const {applySuppliedPickerAffine:run}=require(modulePath);
 const r=run({point:[12.5,-3.25],matrix:[1,0,0,0,1,0]});
 assert.deepEqual(Array.from(r.point),[12.5,-3.25]);
 assert.equal(r.scale,1);assert.equal(r.capApplied,false);
 assert.equal(run({point:[3,4],matrix:[1,0,0,0,1,0],cap:undefined}).capApplied,false);
 const src=new Float64Array([1,0,0,0,1,0]),pt=new Float64Array([5,6]);
 const r2=run({point:pt,matrix:src});
 assert.equal(r2.point[0],5);assert.equal(r2.point[1],6);
 assert.deepEqual(Array.from(pt),[5,6]);assert.deepEqual(Array.from(src),[1,0,0,0,1,0]);
});

test('picker coordinate caps both axes only when max dimension exceeds cap and keeps F32 scale',()=>{
 const {applySuppliedPickerAffine:run}=require(modulePath);
 const m=[1,0,0,0,1,0];
 const a=run({point:[3000,-1234.567],matrix:m,cap:2000,displayWH:[4000,1000]});
 assert.equal(a.capApplied,true);assert.equal(a.scale,0.5);
 assert.deepEqual(Array.from(a.point),[1500,-617.2835083007812]);
 // maxDim 等于 cap 时不做缩放，边界严格为 >。
 const b=run({point:[2000,1999],matrix:m,cap:2000,displayWH:[2000,1000]});
 assert.equal(b.capApplied,false);assert.equal(b.scale,1);assert.deepEqual(Array.from(b.point),[2000,1999]);
 // 不可精确表示的比值必须先F32再分别乘两轴，不能一次乘 DOUBLE 比值。
 const c=run({point:[2500,1000],matrix:m,cap:1000,displayWH:[3000,3000]});
 assert.equal(c.scale,f(1000/3000));assert.equal(c.point[0],833.3333740234375);
 assert.equal(c.point[1],333.3333435058594);
 const d=run({point:[3000,3000],matrix:m,cap:2049,displayWH:[2049,1]});
 assert.equal(d.capApplied,false);
});

test('picker coordinate converts to integer with CVTT(v+.5) and the documented negative path',()=>{
 const {toSuppliedPickerInteger:toInt}=require(modulePath);
 for(const [v,w]of [[2.5,3],[2.4,2],[0.5,1],[0,0],[-0.2,0],[-0.5,0],[-1.5,-1],[-2.5,-2]])assert.equal(toInt(v),w,String(v));
 // 负值路径先取 t=F32(v−1) 再补余项，与直接 trunc(v+.5) 在这些点不同。
 for(const [v,w]of [[-0.6,-1],[-3.2,-3],[-0.7,-1],[-1.7,-2],[-2.7,-3]])assert.equal(toInt(v),w,String(v));
 assert.notEqual(toInt(-0.6),Math.trunc(f(-0.6+0.5)));
 assert.notEqual(toInt(-3.2),Math.trunc(f(-3.2+0.5)));
 assert.equal(toInt(0.4999999),0);assert.equal(toInt(-0.4999999,),0);
});

test('picker coordinate rejects missing or invalid supplies instead of defaulting',()=>{
 const {applySuppliedPickerAffine:run,toSuppliedPickerInteger:toInt}=require(modulePath);
 assert.throws(()=>run(),TypeError);
 assert.throws(()=>run({point:[1,2]}),TypeError);
 assert.throws(()=>run({matrix:[1,0,0,0,1,0]}),TypeError);
 assert.throws(()=>run({point:[1,2],matrix:[1,0,0,0,1]}),TypeError);
 assert.throws(()=>run({point:[1,NaN],matrix:[1,0,0,0,1,0]}),TypeError);
 assert.throws(()=>run({point:[1,2],matrix:[1,0,0,0,1,Infinity]}),TypeError);
 assert.throws(()=>run({point:['1',2],matrix:[1,0,0,0,1,0]}),TypeError);
 assert.throws(()=>run({point:[1,2],matrix:[1,0,0,0,1,0],cap:0,displayWH:[10,10]}),RangeError);
 assert.throws(()=>run({point:[1,2],matrix:[1,0,0,0,1,0],cap:2000}),RangeError);
 assert.throws(()=>run({point:[1,2],matrix:[1,0,0,0,1,0],cap:2000,displayWH:[0,10]}),RangeError);
 assert.throws(()=>run({point:[1,2],matrix:[1,0,0,0,1,0],cap:2000,displayWH:[40000,10]}),RangeError);
 assert.throws(()=>toInt(NaN),TypeError);
 assert.throws(()=>toInt(Infinity),TypeError);
 assert.throws(()=>toInt('3'),TypeError);
});
