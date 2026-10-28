'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const policy={math:'native-byte1-key7-supplied-unit-canvas-generic',rounding:'nearest-even',unmasked:true};
function api(){return require('../inference/skin-reference/key7-frames.cjs').refineSuppliedReferenceKey7Frames;}
function constant(value,width,height){return {data:new Uint8Array(width*height).fill(value),width,height,stride:width,channels:1};}
test('key7两路整图修正后分别进入现有精修，基础与保护输出保持独立',()=>{
 const run=api(),{refineSuppliedReferenceBase}=require('../inference/skin-reference/base-frame.cjs');
 const photo={data:Uint8Array.from({length:13*15*3},(_,i)=>(i*11+17)%256),width:13,height:15,stride:39,format:301,channels:3};
 const r={...policy,photo,aggregate:constant(44,9,11),key7:constant(105,9,11),auxiliary:constant(9,9,11),unitCanvas:constant(1,9,11),range:new Float32Array(256).fill(1),spatial:new Float32Array(5).fill(1)};
 const out=run(r),shared={photo,range:r.range,spatial:r.spatial,rounding:r.rounding};
 assert.equal(out.available,true);assert.deepEqual(out.correction,refineSuppliedReferenceBase({...shared,mask:constant(126,9,11)}));
 assert.deepEqual(out.base,refineSuppliedReferenceBase({...shared,mask:constant(170,9,11)}));
 assert.equal(out.base.side,13);assert.equal(out.correction.updated,true);assert.equal(out.base.updated,true);
 assert.notEqual(out.base.mask.buffer,out.correction.mask.buffer);assert.ok(out.base.mask.some((v,i)=>v!==out.correction.mask[i]));
});
test('key7双精修缺失画布不读照片；两路bbox门未通过时不读取权重',()=>{
 const run=api(),missing={...policy};
 for(const key of ['photo','aggregate','key7','auxiliary','range','spatial'])Object.defineProperty(missing,key,{get(){throw Error('缺失画布应先返回');}});
 assert.deepEqual(run(missing),{available:false,base:null,correction:null});
 const r={...policy,photo:{data:new Uint8Array(3*3*3),width:3,height:3,stride:9,format:300},aggregate:constant(0,3,3),key7:constant(0,3,3),auxiliary:constant(0,3,3),unitCanvas:constant(1,3,3)};
 for(const key of ['range','spatial'])Object.defineProperty(r,key,{get(){throw Error('bbox门前不得读取权重');}});
 const out=run(r);assert.equal(out.available,true);for(const part of [out.base,out.correction])assert.deepEqual(part,{updated:false,mask:null,ROI:null,radius:null,side:3});
});
