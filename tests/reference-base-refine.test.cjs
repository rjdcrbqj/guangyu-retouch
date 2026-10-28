'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const golden=require('./fixtures/reference-base-refine-new-golden.json');
test('base ROI五步完整串联与新Fraction golden一致，finish不能提到bilateral前',()=>{
 const {refineSuppliedReferenceBaseROI}=require('../inference/skin-reference/base-refine.cjs');
 assert.equal(golden.wrongFinishBeforeBilateralBYTEdifferences,156);
 for(const c of golden.cases){
  const guide=Uint8Array.from(c.guide),mask=Uint8Array.from(c.mask),range=Float32Array.from(c.range),spatial=Float32Array.from(c.spatial),rangeBefore=range.slice(),spatialBefore=spatial.slice();
  const out=refineSuppliedReferenceBaseROI({...c,guide,mask,range,spatial,rounding:'nearest-even'});
  assert.deepEqual(Array.from(out),c.output,`radius${c.radius}`);assert.notEqual(out,mask);
  assert.deepEqual(Array.from(guide),c.guide);assert.deepEqual(Array.from(mask),c.mask);assert.deepEqual(range,rangeBefore);assert.deepEqual(spatial,spatialBefore);
 }
});
test('常量BYTE150只在两次LUT改变成180再131，返回独立mono buffer',()=>{
 const {refineSuppliedReferenceBaseROI}=require('../inference/skin-reference/base-refine.cjs');
 const r={guide:new Uint8Array(5*7*3),mask:new Uint8Array(35).fill(150),width:5,height:7,radius:1,range:new Float32Array(256).fill(1),spatial:new Float32Array(5).fill(1),rounding:'nearest-even'};
 const out=refineSuppliedReferenceBaseROI(r);assert.deepEqual(out,new Uint8Array(35).fill(131));out[0]=9;assert.equal(r.mask[0],150);
});
test('不猜未知舍入或weights，所有不合法数据拒绝且输入不变',()=>{
 const {refineSuppliedReferenceBaseROI}=require('../inference/skin-reference/base-refine.cjs');
 const r={guide:new Uint8Array(75).fill(128),mask:new Uint8Array(25).fill(180),width:5,height:5,radius:1,range:new Float32Array(256).fill(1),spatial:new Float32Array(5).fill(1),rounding:'nearest-even'};
 for(const patch of [{rounding:undefined},{width:4},{height:1501},{radius:0},{radius:16},{guide:new Uint8Array(1)},{mask:new Uint8Array(1)},{range:undefined},{spatial:new Float32Array(13).fill(1)}]){
  assert.throws(()=>refineSuppliedReferenceBaseROI({...r,...patch}));assert.deepEqual(r.mask,new Uint8Array(25).fill(180));assert.deepEqual(r.guide,new Uint8Array(75).fill(128));
 }
});
