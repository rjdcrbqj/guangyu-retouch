'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let blend;try{blend=require('../inference/skin-reference/final-blend.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

test('new final blend matches all47 historical results without executing old code',()=>{
 assert.equal(typeof blend?.blendReferenceROI,'function','reference final blend is missing');
 const dir='D:/文件夹/codex/像素蛋糕Windows研究_2026-10-09/Ghidra分析/功能扩展_2026-10-11/人像修复完整性/skin-unify-reference-final-byte-blend-numeric-research/first-capture';
 const bytes=fs.readFileSync(path.join(dir,'report.json'));
 assert.equal(sha(bytes),'48c711c4fca5fbfd7a14accd2a6736acecd4b2dbbb44c6024fcba475ef849e16');
 const rows=JSON.parse(bytes).rows;assert.equal(rows.length,47);let fields=0;
 for(const row of rows){
  const data={};for(const [name,info] of Object.entries(row.files)){const b=fs.readFileSync(path.join(dir,info.file));assert.equal(b.length,info.bytes);assert.equal(sha(b),info.SHA256);data[name]=b;}
  const p=row.parameters,s=row.strides,before=data.original.slice();
  const out=blend.blendReferenceROI({source:data.original,width:p.photoW,height:p.photoH,stride:s.originalStride,channels:p.cn,ROI:[p.roiX,p.roiY,p.roiW,p.roiH],processed:data.processed,processedStride:s.processedStride,mask:data.mask,maskStride:s.maskStride,intensity:p.intensity,startRow:p.begin,endRow:p.end});
  assert.deepEqual(Buffer.from(out),data.output);assert.deepEqual(data.original,before);fields+=out.length;
 }
 assert.equal(fields,49981);
});

test('F32 rounds .35 blend before truncation and preserves source alpha and padding',()=>{
 assert.equal(typeof blend?.blendReferenceROI,'function','reference final blend is missing');
 const source=new Uint8Array(20).fill(167);source.set([0,0,0,193]);
 const args={source,width:2,height:2,stride:10,channels:4,ROI:[0,0,1,1],processed:new Uint8Array([20,40,60,199]),processedStride:4,mask:new Uint8Array([255,199]),maskStride:2,intensity:.35};
 const out=blend.blendReferenceROI(args);
 assert.deepEqual(Array.from(out.slice(0,4)),[7,14,21,193]);assert.deepEqual(out.slice(4),source.slice(4));assert.equal(source[0],0);
 for(const patch of [{intensity:Infinity},{intensity:1e100},{ROI:[2,0,1,1]},{processed:new Uint8Array(2)},{maskStride:0},{startRow:-1},{endRow:2},{channels:2}])assert.throws(()=>blend.blendReferenceROI({...args,...patch}));
});

test('equal source and processed retain original F32 self-blend rounding',()=>{
 const source=new Uint8Array(12).fill(29);
 const out=blend.blendReferenceROI({source,width:2,height:2,stride:6,channels:3,ROI:[0,0,1,1],processed:new Uint8Array([29,29,29]),processedStride:3,mask:new Uint8Array([255]),maskStride:1,intensity:.35});
 assert.deepEqual(Array.from(out.slice(0,3)),[28,28,28]);assert.deepEqual(out.slice(3),source.slice(3));assert.equal(source[0],29);
});
