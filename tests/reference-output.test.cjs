'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{createHash}=require('node:crypto');
let core;try{core=require('../inference/skin-reference/output-row.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const AREA=768*768;
function heads(raw=0){const coefficients=new Float32Array(9*AREA);for(const c of [0,4,8])coefficients.fill(1,c*AREA,(c+1)*AREA);return {coefficients,mask:new Float32Array(AREA).fill(raw)};}
function request(work){return {source:new Uint8Array(4*3*4+3*2).fill(128),width:4,height:3,stride:18,channels:4,ROI:[1,1,2,1],startRow:0,endRow:1,postAffine:Float32Array.from([1,0,0,0,1,0]),pixelMask:Uint8Array.from([255,0,77]),maskStride:3,work};}

test('768 work buffers preserve normalized negatives and zero bias on coefficient grid',()=>{
 assert.equal(typeof core?.prepareReferenceHeads,'function','reference output adapter is missing');
 const h=heads();h.mask[0]=-1.0000001192092896;h.mask[1]=-1;h.mask[2]=0;h.mask[3]=1;
 const work=core.prepareReferenceHeads(h),bits=new Uint32Array(work.normalizedMask.buffer);
 assert.deepEqual(Array.from(bits.slice(0,4)),[0xb3800000,0,0x3f000000,0x3f800000]);
 assert.equal(work.bias.length,3*AREA);assert.equal(work.secondResidual.length,AREA);
 assert.ok(work.bias.every(v=>v===0));assert.ok(work.secondResidual.every(v=>v===0));
 h.coefficients[0]=2;assert.equal(work.coefficients[0],1);
 assert.throws(()=>core.prepareReferenceHeads({...h,mask:new Float32Array(384*384)}));
 h.coefficients[AREA-1]=NaN;assert.throws(()=>core.prepareReferenceHeads(h));
});

test('fit output uses head masks and copies gated pixels with physical channel3 untouched',()=>{
 assert.equal(typeof core?.applyReferenceRows,'function','reference output adapter is missing');
 const r=request(core.prepareReferenceHeads(heads())),before=r.source.slice();
 const out=core.applyReferenceRows(r);assert.equal(out.stride,6);assert.deepEqual(Array.from(out.processed),[192,192,192,128,128,128]);
 assert.deepEqual(r.source,before);
 const disabled=request(core.prepareReferenceHeads(heads(-1)));assert.deepEqual(Array.from(core.applyReferenceRows(disabled).processed),[128,128,128,128,128,128]);
 r.startRow=1;r.endRow=1;assert.deepEqual(Array.from(core.applyReferenceRows(r).processed),[128,128,128,128,128,128]);
 assert.throws(()=>core.applyReferenceRows({...r,ROI:[3,1,2,1]}));assert.throws(()=>core.applyReferenceRows({...r,pixelMask:new Uint8Array(1)}));
});

test('absolute ROI coordinates sample different coefficient grid nodes',()=>{
 assert.equal(typeof core?.applyReferenceRows,'function','reference output adapter is missing');
 const h=heads();for(const plane of [0,4,8])h.coefficients[plane*AREA+1*768+1]=0;
 const r=request(core.prepareReferenceHeads(h));r.pixelMask[1]=255;
 assert.deepEqual(Array.from(core.applyReferenceRows(r).processed),[128,128,128,192,192,192]);
});

test('coordinates reject finite signed-INT32 overflow instead of sampling the opposite edge',()=>{
 assert.equal(typeof core?.applyReferenceRows,'function','reference output adapter is missing');
 const work=core.prepareReferenceHeads(heads()),r=request(work);
 r.ROI=[0,0,1,1];r.pixelMask=Uint8Array.of(255);r.maskStride=1;
 for(const affine of [[0,0,2**31,0,0,0],[0,0,0,0,0,2**31],[0,0,-(2**31),0,0,0],[0,0,0,0,0,-(2**31)]]){
  assert.throws(()=>core.applyReferenceRows({...r,postAffine:Float32Array.from(affine)}),RangeError);
 }
 r.ROI=[1,1,1,1];assert.throws(()=>core.applyReferenceRows({...r,postAffine:Float32Array.from([3e38,3e38,0,0,1,0])}),RangeError);
});

test('new row math matches 138 retained original pixel outputs without executing old code',()=>{
 assert.equal(typeof core?.applyReferenceRows,'function','reference output adapter is missing');
 const bytes=fs.readFileSync('D:/文件夹/codex/像素蛋糕Windows研究_2026-10-09/Ghidra分析/功能扩展_2026-10-11/人像修复完整性/skin-unify-photo-input-output-numeric-research/numeric-capture.json');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'ac47736b82fc71a5e2d1375e0aee248406cd648d630fb6803d8f9d09f9d85161');
 const rows=JSON.parse(bytes).rows.filter(r=>r.group==='plane-order'||(r.weightX===1&&r.weightY===1&&(r.alphaCoefficient>0||r.alphaBias>0)));
 assert.equal(rows.length,138);
 const work={coefficients:new Float32Array(9*AREA),bias:new Float32Array(3*AREA),normalizedMask:new Float32Array(AREA),secondResidual:new Float32Array(AREA)};
 const nodes=[0,1,768,769];
 for(const old of rows){
  assert.equal(old.planeSize,4);assert.deepEqual(old.indices,[0,1,2,3]);
  for(let plane=0;plane<9;plane++)for(let n=0;n<4;n++)work.coefficients[plane*AREA+nodes[n]]=old.coefficients[plane*4+n];
  for(let plane=0;plane<3;plane++)for(let n=0;n<4;n++)work.bias[plane*AREA+nodes[n]]=old.bias[plane*4+n];
  work.normalizedMask.fill(old.alphaCoefficient);work.secondResidual.fill(old.alphaBias);
  const source=new Uint8Array(16);source.set(old.source);
  const out=core.applyReferenceRows({source,width:2,height:2,stride:8,channels:4,ROI:[0,0,1,1],startRow:0,endRow:1,
   postAffine:Float32Array.from([0,0,1-old.weightX,0,0,1-old.weightY]),pixelMask:Uint8Array.of(255),maskStride:1,work});
  assert.deepEqual(Array.from(out.processed),old.original,'retained original pixel '+old.id);
 }
});
