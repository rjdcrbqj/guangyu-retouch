'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
let stage;try{stage=require('../inference/skin-reference/secondary.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const ROOT='D:/文件夹/codex/像素蛋糕Windows研究_2026-10-09/Ghidra分析/功能扩展_2026-10-11/人像修复完整性/skin-unify-reference-secondary-trigger-numeric-research';
test('新补充判断只读12个历史叶缓存，保留stride与有符号累积',()=>{
 assert.equal(typeof stage?.scoreSuppliedReferenceDifference,'function','secondary stage is missing');
 let cases=0;
 for(const dir of ['first-capture','first-channel-contrast']){
  const report=JSON.parse(fs.readFileSync(path.join(ROOT,dir,'report.json'),'utf8'));
  for(const row of report.rows){
   const buffers={};for(const r of row.files){const b=fs.readFileSync(path.join(ROOT,dir,r.file));assert.equal(b.length,r.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),r.SHA256);buffers[r.role]=b;}
   const p=row.parameters,before=Object.fromEntries(Object.entries(buffers).map(([k,b])=>[k,b.slice()]));
   const actual=stage.scoreSuppliedReferenceDifference({...buffers,width:p.width,height:p.height,originalChannels:p.cnOriginal,processedChannels:p.cnProcessed,
    originalStride:p.originalStride,processedStride:p.processedStride,maskStride:p.maskStride,startRow:p.begin,endRow:p.end,initialScore:p.initialScore,initialCount:p.initialCount});
   assert.equal(actual.score,BigInt(row.score));assert.equal(actual.count,BigInt(row.count));assert.equal(actual.trigger,row.pureParentPredicate);
   for(const [k,b]of Object.entries(buffers))assert.deepEqual(b,before[k]);cases++;
  }
 }
 assert.equal(cases,12);
});
test('补充判断严格阈值与物理权重、空选择和signed64边界',()=>{
 assert.equal(typeof stage?.scoreSuppliedReferenceDifference,'function','secondary stage is missing');
 const r={original:new Uint8Array([25,25,25,250]),processed:new Uint8Array([0,0,0,0]),mask:new Uint8Array([1]),width:1,height:1,originalChannels:4,processedChannels:4,originalStride:4,processedStride:4,maskStride:1};
 assert.deepEqual(stage.scoreSuppliedReferenceDifference(r),{score:25000n,count:1n,trigger:false});
 r.original.set([26,26,26]);assert.equal(stage.scoreSuppliedReferenceDifference(r).trigger,true);
 for(let c=0;c<3;c++){r.original.fill(0);r.original[c]=50;assert.equal(stage.scoreSuppliedReferenceDifference(r).trigger,c===1);}
 assert.deepEqual(stage.scoreSuppliedReferenceDifference({...r,mask:new Uint8Array([0])}),{score:0n,count:0n,trigger:false});
 r.original.fill(0);assert.deepEqual(stage.scoreSuppliedReferenceDifference({...r,initialScore:(1n<<63n)-1n,initialCount:(1n<<63n)-1n}),{score:(1n<<63n)-1n,count:-(1n<<63n),trigger:true});
 for(const patch of [{width:0},{height:4097},{maskStride:0},{processed:new Uint8Array(3)},{initialScore:1.5},{initialCount:'1'},{startRow:2}])assert.throws(()=>stage.scoreSuppliedReferenceDifference({...r,...patch}),TypeError);
});
