'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let stage;try{stage=require('../inference/skin-reference/post-blend.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function run(o){assert.equal(typeof stage?.applySuppliedSecondaryPostBlend,'function','secondary post blend stage is missing');return stage.applySuppliedSecondaryPostBlend(o);}
function one(){return {source:Uint8Array.from([1,2,3]),width:1,height:1,stride:3,channels:3,ROI:[0,0,1,1],mask1:Uint8Array.of(127),mask1Stride:1,mask2:Uint8Array.of(0),mask2Stride:1,tableA:Uint8Array.from({length:256},(_,i)=>Math.min(255,i+1)),tableB:Uint8Array.from({length:256},(_,i)=>i),rounding:'nearest-even'};}
test('B后A查表，两个独立stride mask和负rest保留RGBA/ROI外/padding/输入',()=>{
 const source=new Uint8Array(19*4+2).fill(173);
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)source.set([10,100,200,91],y*19+x*4);
 const r={...one(),source,width:4,height:4,stride:19,channels:4,ROI:[1,1,2,2],
  mask1:Uint8Array.from([255,0,99,0,255,99]),mask1Stride:3,
  mask2:Uint8Array.from([0,255,88,88,0,255,88,88]),mask2Stride:4,
  tableB:Uint8Array.from({length:256},(_,i)=>255-i),tableA:Uint8Array.from({length:256},(_,i)=>Math.floor(i/2))};
 const names=['source','mask1','mask2','tableA','tableB'],before=names.map(k=>r[k].slice()),out=run(r),want=source.slice();
 for(const [x,y,pixel] of [[1,1,[122,77,27]],[2,1,[245,155,55]],[1,2,[10,100,200]],[2,2,[255,132,0]]])want.set(pixel,y*19+x*4);
 assert(out instanceof Uint8Array);assert.notEqual(out,source);assert.deepEqual(out,want);
 names.forEach((k,i)=>assert.deepEqual(r[k],before[i]));out.fill(0);names.forEach((k,i)=>assert.deepEqual(r[k],before[i]));
});
test('half两侧按最近整数而非截断转换',()=>{
 // 127/255 < 1/2 < 128/255；合法 BYTE 权重不能正好表示 1/2。
 const r=one();assert.deepEqual(run(r),Uint8Array.from([1,2,3]));
 r.mask1[0]=128;assert.deepEqual(run(r),Uint8Array.from([2,3,4]));
});
test('拒绝空ROI、越界/不完整缓冲与缺失或不支持rounding',()=>{
 assert.equal(typeof stage?.applySuppliedSecondaryPostBlend,'function','secondary post blend stage is missing');
 const r=one(),before=r.source.slice();
 for(const patch of [{ROI:[0,0,0,1]},{ROI:[0,0,1,0]},{ROI:[-1,0,1,1]},{ROI:[0,0,2,1]},{ROI:[0,0,1.5,1]},
  {channels:2},{width:0},{stride:2},{source:new Uint8Array(2)},{mask1:new Uint8Array(0)},{mask2Stride:0},
  {mask1Stride:2},{tableA:new Uint8Array(255)},{tableB:new Uint8Array(257)},{tableB:new Float32Array(256)},
  {rounding:undefined},{rounding:'truncate'},{rounding:'nearest-away'}]){
  assert.throws(()=>run({...r,...patch}));assert.deepEqual(r.source,before);
 }
 assert.throws(()=>run());
});
