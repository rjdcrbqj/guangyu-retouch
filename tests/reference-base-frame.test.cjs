'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function api(){return require('../inference/skin-reference/base-frame.cjs').refineSuppliedReferenceBase;}
function weights(){return {range:new Float32Array(256).fill(1),spatial:new Float32Array(5).fill(1)};}
test('base frame photo12x8决定S8,独立mask20x14先resize后细化解析131',()=>{
 const run=api(),photo={data:new Uint8Array(12*8*3),width:12,height:8,stride:36,format:301},mask={data:new Uint8Array(20*14).fill(150),width:20,height:14,stride:20};
 const tables=weights(),r=run({photo,mask,...tables,rounding:'nearest-even'});
 assert.deepEqual([r.updated,r.side,r.radius],[true,8,1]);assert.deepEqual(Array.from(r.ROI),[0,0,8,8]);
 assert.equal(r.mask.length,64);assert.ok(r.mask.every(v=>v===131));assert.ok(mask.data.every(v=>v===150));assert.ok(photo.data.every(v=>v===0));
 assert.ok(tables.range.every(v=>v===1));assert.notEqual(r.mask.buffer,mask.data.buffer);
});
test('base frame nonzero BYTEviews/lastactive row及300标签不更换物理通道',()=>{
 const run=api(),pBacking=new Uint8Array(5*9*3+31).fill(222),mBacking=new Uint8Array(6*7+29).fill(223);
 const photo={data:new Uint8Array(pBacking.buffer,7,8*18+15),width:5,height:9,stride:18,format:300,channels:3};
 for(let y=0;y<9;y++)photo.data.fill(0,y*18,y*18+15);
 const mask={data:new Uint8Array(mBacking.buffer,3,5*8+7),width:7,height:6,stride:8,channels:1};
 for(let y=0;y<6;y++)mask.data.fill(150,y*8,y*8+7);
 const beforeP=pBacking.slice(),beforeM=mBacking.slice(),r=run({photo,mask,...weights(),rounding:'nearest-even'});
 assert.equal(r.side,5);assert.deepEqual(Array.from(r.ROI),[0,0,5,5]);assert.ok(r.mask.every(v=>v===131));
 assert.deepEqual(pBacking,beforeP);assert.deepEqual(mBacking,beforeM);
});
test('base frame nohit/longthin最终不写且不访问未生成weights',()=>{
 const run=api();for(const thin of [false,true]){
  const photo={data:new Uint8Array(5*8*3),width:5,height:8,stride:15,format:301},mask={data:new Uint8Array(25),width:5,height:5,stride:5};
  if(thin)mask.data.fill(255,5,10);
  let reads=0;const r=run({photo,mask,rounding:'nearest-even',get range(){reads++;throw Error('unexpected range');},get spatial(){reads++;throw Error('unexpected spatial');}});
  assert.deepEqual(r,{updated:false,mask:null,ROI:null,radius:null,side:5});assert.equal(reads,0);
 }
});
test('base frame invalid physical供给/缺真实table拒绝,source不变',()=>{
 const run=api(),photo={data:new Uint8Array(75),width:5,height:5,stride:15,format:301},mask={data:new Uint8Array(25).fill(150),width:5,height:5,stride:5};
 const r={photo,mask,...weights(),rounding:'nearest-even'},beforeP=photo.data.slice(),beforeM=mask.data.slice();
 for(const patch of [{photo:{...photo,format:401}},{photo:{...photo,channels:4}},{mask:{...mask,channels:3}},
  {mask:{...mask,data:new Uint8Array(24)}},{photo:{...photo,width:32767}},{range:undefined},{spatial:undefined},{rounding:'toward-zero'}])assert.throws(()=>run({...r,...patch}));
 assert.deepEqual(photo.data,beforeP);assert.deepEqual(mask.data,beforeM);
});
