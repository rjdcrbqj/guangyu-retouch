'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const math='native-byte3-byte1-code1-secondary512-supplied';
function api(){return require('../inference/skin-reference/secondary-source512.cjs').prepareSuppliedSecondaryFrom512Source;}
function request(){
 const data=new Uint8Array(53).fill(91),mask=new Uint8Array(19).fill(173);
 for(let y=0;y<5;y++){data.fill(128,y*11,y*11+9);mask.fill(64,y*4,y*4+3);}
 return {sourcePhoto:{data,width:3,height:5,stride:11,channels:3},sourceMask:{data:mask,width:3,height:5,stride:4,channels:1},initialCounters:new Int32Array(256),grayTable:Uint8Array.from({length:256},(_,i)=>i),highFraction:.04,lowFraction:.03,histogramMaskThreshold:0,rounding:'nearest-even',math};
}
test('source512 composition counts actual supplied working pixels then restores both masks to a3x5 ROI',()=>{
 const run=api(),r=request(),photo=r.sourcePhoto.data.slice(),mask=r.sourceMask.data.slice(),table=r.grayTable.slice(),v=run(r);
 assert.equal(v.available,true);assert.deepEqual(v.workingWH,[512,512]);assert.equal(v.effectiveRadius,30);
 assert.deepEqual(v.cutoffs,{high:128,low:128});assert.equal(v.histogram[128],262144);assert.equal(v.histogram.reduce((a,b)=>a+b,0),262144);
 for(const m of [v.high,v.derivedLow]){assert.deepEqual([m.width,m.height,m.stride],[3,5,3]);assert.equal(m.data.length,15);assert.equal(m.data.every(x=>x===64),true);}
 assert.notEqual(v.high.data,v.derivedLow.data);assert.deepEqual(r.sourcePhoto.data,photo);assert.deepEqual(r.sourceMask.data,mask);assert.deepEqual(r.grayTable,table);assert.equal(r.initialCounters.every(x=>x===0),true);
});
test('source512 requires actual initial counters and table before reading photo, and refuses incompatible inputs',()=>{
 const run=api();
 for(const missing of ['initialCounters','grayTable']){const r=request();r[missing]=null;Object.defineProperty(r,'sourcePhoto',{get(){throw Error('missing actual supply must not read photo');}});const v=run(r);assert.equal(v.available,false);assert.equal(v.high,null);assert.equal(v.derivedLow,null);}
 for(const patch of [{initialCounters:new Int32Array(256).fill(1)},{initialCounters:new Float32Array(256)},{initialCounters:new Int32Array(255)},{grayTable:new Uint8Array(255)},{histogramMaskThreshold:1},{rounding:undefined},{math:undefined}])assert.throws(()=>run({...request(),...patch}));
 const r=request();assert.throws(()=>run({...r,sourceMask:{...r.sourceMask,width:2}}));assert.throws(()=>run({...r,sourcePhoto:{...r.sourcePhoto,channels:4}}));
});
