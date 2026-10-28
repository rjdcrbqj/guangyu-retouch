'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const modulePath='../inference/skin-reference/picker-affine.cjs';
const f=Math.fround;

// 对应 LIVE 1425f42e0：三点对应 -> 六元仿射 [a,b,c,d,e,f]，X=a*x+b*y+c，Y=d*x+e*y+f。
// 输入按F32存储读取后精确提升DOUBLE，消元/回代在DOUBLE域，输出再取F32。

test('picker affine solves a known three-point correspondence exactly',()=>{
 const {solveSuppliedPickerAffine:run}=require(modulePath);
 const r=run({sourcePoints:[[0,0],[1,0],[0,1]],targetPoints:[[10,-5],[12,-4.75],[10.5,-2]]});
 assert.equal(r.degenerate,false);
 assert.deepEqual(Array.from(r.coefficients),[2,0.5,10,0.25,3,-5]);
});

test('picker affine returns identity for an identity correspondence',()=>{
 const {solveSuppliedPickerAffine:run}=require(modulePath);
 const r=run({sourcePoints:[[0,0],[1,0],[0,1]],targetPoints:[[0,0],[1,0],[0,1]]});
 assert.equal(r.degenerate,false);
 assert.deepEqual(Array.from(r.coefficients),[1,0,0,0,1,0]);
 // 平移与缩放同样精确。
 const s=run({sourcePoints:[[0,0],[2,0],[0,2]],targetPoints:[[4,7],[8,7],[4,11]]});
 assert.deepEqual(Array.from(s.coefficients),[2,0,4,0,2,7]);
});

test('picker affine reports degenerate collinear input instead of faking zeros or identity',()=>{
 const {solveSuppliedPickerAffine:run}=require(modulePath);
 const r=run({sourcePoints:[[0,0],[1,1],[2,2]],targetPoints:[[0,0],[10,10],[20,20]]});
 assert.equal(r.degenerate,true);
 const c=Array.from(r.coefficients);
 assert.equal(c.length,6);
 assert.ok(c.every(v=>Number.isFinite(v)),'系数必须仍是有限数');
 // 原版退化时输出当时RHS；不得改写成全零或恒等。
 assert.notDeepEqual(c,[0,0,0,0,0,0]);
 assert.notDeepEqual(c,[1,0,0,0,1,0]);
 // 三个源点重合同样是退化。
 assert.equal(run({sourcePoints:[[3,4],[3,4],[3,4]],targetPoints:[[0,0],[1,0],[0,1]]}).degenerate,true);
});

test('picker affine composes with the supplied coordinate transform',()=>{
 const {solveSuppliedPickerAffine:run}=require(modulePath);
 const {applySuppliedPickerAffine:apply}=require('../inference/skin-reference/picker-coordinate.cjs');
 const src=[[0,0],[1,0],[0,1]],dst=[[10,-5],[12,-4.75],[10.5,-2]];
 const m=Array.from(run({sourcePoints:src,targetPoints:dst}).coefficients);
 for(let i=0;i<3;i++){
  const p=apply({point:src[i],matrix:m}).point;
  assert.equal(p[0],f(dst[i][0]));assert.equal(p[1],f(dst[i][1]));
 }
});

test('picker affine rejects invalid supplies and does not mutate callers',()=>{
 const {solveSuppliedPickerAffine:run}=require(modulePath);
 assert.throws(()=>run(),TypeError);
 assert.throws(()=>run({sourcePoints:[[0,0],[1,0],[0,1]]}),TypeError);
 assert.throws(()=>run({targetPoints:[[0,0],[1,0],[0,1]]}),TypeError);
 assert.throws(()=>run({sourcePoints:[[0,0],[1,0]],targetPoints:[[0,0],[1,0],[0,1]]}),TypeError);
 assert.throws(()=>run({sourcePoints:[[0,0],[1,0],[0,1]],targetPoints:[[0,0],[1,0],[0,NaN]]}),TypeError);
 assert.throws(()=>run({sourcePoints:[[0,0],[1,0],[0,'1']],targetPoints:[[0,0],[1,0],[0,1]]}),TypeError);
 assert.throws(()=>run({sourcePoints:[[0,0],[1,0],[0,1,2]],targetPoints:[[0,0],[1,0],[0,1]]}),TypeError);
 const src=[[0,0],[1,0],[0,1]],dst=[[10,-5],[12,-4.75],[10.5,-2]];
 const before=JSON.stringify([src,dst]);
 run({sourcePoints:src,targetPoints:dst});
 assert.equal(JSON.stringify([src,dst]),before);
});
