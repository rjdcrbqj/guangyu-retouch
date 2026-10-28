'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const golden=require('./fixtures/reference-guided-new-golden.json');

test('完整guided逐步结果与新独立Fraction golden一致，覆盖r1/r2/r3与非整SIMD宽度',()=>{
 const {guidedRefineBYTE3}=require('../inference/skin-reference/guided.cjs');
 for(const c of golden.cases){
  const guide=Uint8Array.from(c.guide),source=Uint8Array.from(c.source);
  const output=guidedRefineBYTE3({...c,guide,source,rounding:'nearest-even'});
  assert.ok(output instanceof Uint8Array);
  assert.deepEqual(Array.from(output),c.output,`radius${c.radius}`);
  assert.deepEqual(Array.from(guide),c.guide);assert.deepEqual(Array.from(source),c.source);
  assert.notEqual(output,source);
 }
});

test('零guide和常量mask保持BYTE单位，不重复乘255且不与source共用buffer',()=>{
 const {guidedRefineBYTE3}=require('../inference/skin-reference/guided.cjs');
 const guide=new Uint8Array(5*5*3),source=new Uint8Array(25).fill(36);
 const output=guidedRefineBYTE3({guide,source,width:5,height:5,radius:1,rounding:'nearest-even'});
 assert.deepEqual(output,new Uint8Array(25).fill(36));
 output[0]=99;assert.equal(source[0],36);assert.equal(guide[0],0);
});

test('不明舍入及packed布局和范围错误必须拒绝，原输入保持不变',()=>{
 const {guidedRefineBYTE3}=require('../inference/skin-reference/guided.cjs');
 const c={guide:new Uint8Array(75).fill(90),source:new Uint8Array(25).fill(70),width:5,height:5,radius:1,rounding:'nearest-even'};
 for(const update of [{rounding:undefined},{rounding:'toward-zero'},{width:4},{height:1501},{radius:0},{radius:16},{radius:1.5},{guide:new Uint8Array(74)},{source:new Uint8Array(24)},{guide:new Float32Array(75)}]){
  assert.throws(()=>guidedRefineBYTE3({...c,...update}));
 }
 assert.deepEqual(c.guide,new Uint8Array(75).fill(90));assert.deepEqual(c.source,new Uint8Array(25).fill(70));
});
