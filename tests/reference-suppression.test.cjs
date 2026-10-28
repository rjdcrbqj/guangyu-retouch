'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
let stage;try{stage=require('../inference/skin-reference/suppression.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const ROOT='D:/文件夹/codex/像素蛋糕Windows研究_2026-10-09/Ghidra分析/功能扩展_2026-10-11/人像修复完整性/skin-unify-reference-byte-mask-suppression-numeric-research/first-capture';
test('新削弱实现只读24原标量缓存，798384 BYTE逐字节相同',()=>{
 assert.equal(typeof stage?.suppressSuppliedReferenceMask,'function','mask suppression is missing');
 const reportBytes=fs.readFileSync(path.join(ROOT,'report.json'));
 assert.equal(createHash('sha256').update(reportBytes).digest('hex'),'315fa5077d52b196d030ec9a414e0c261d72b70ed56f23441f11b63ee60ffd71');
 const report=JSON.parse(reportBytes),rows=report.rows;let bytes=0;
 for(const row of rows){
  const buffers={};for(const [role,r]of Object.entries(row.files)){const b=fs.readFileSync(path.join(ROOT,r.file));assert.equal(b.length,r.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),r.SHA256);buffers[role]=b;}
  const p=row.parameters,before=buffers.dest.slice(),prot=buffers.protection.slice();
  const output=stage.suppressSuppliedReferenceMask({mask:buffers.dest,protection:buffers.protection,width:p.width,height:p.height,maskStride:p.destStride,protectionStride:p.protectionStride,factor:p.factor,startRow:p.begin,endRow:p.end});
  assert.deepEqual(Buffer.from(output),buffers.output);assert.deepEqual(buffers.dest,before);assert.deepEqual(buffers.protection,prot);bytes+=output.length;
 }
 assert.equal(rows.length,24);assert.equal(bytes,798384);
});
test('削弱保留零门和源缓冲，负factor采用低BYTE而非钳制',()=>{
 assert.equal(typeof stage?.suppressSuppliedReferenceMask,'function','mask suppression is missing');
 const mask=new Uint8Array([255,255,0,123]),protection=new Uint8Array([255,0,255,0]),r={mask,protection,width:3,height:1,maskStride:4,protectionStride:4,factor:-.1};
 assert.deepEqual(stage.suppressSuppliedReferenceMask(r),new Uint8Array([24,255,0,123]));
 assert.deepEqual(stage.suppressSuppliedReferenceMask({...r,factor:.1}),new Uint8Array([229,255,0,123]));
 assert.deepEqual(stage.suppressSuppliedReferenceMask({...r,factor:.4}),new Uint8Array([153,255,0,123]));
 for(const patch of [{factor:NaN},{factor:Infinity},{factor:2.01},{factor:-.11},{width:0},{height:4097},{maskStride:2},{endRow:2},{protection:new Uint8Array(3)}])assert.throws(()=>stage.suppressSuppliedReferenceMask({...r,...patch}),TypeError);
 assert.deepEqual(mask,new Uint8Array([255,255,0,123]));assert.deepEqual(protection,new Uint8Array([255,0,255,0]));
});
