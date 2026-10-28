'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function api(){return require('../inference/skin-reference/base-resize.cjs').resizeSuppliedReferenceBaseSquare;}
test('base resize 新Double/F32有理golden,mono/physical3独立尺寸与非二进制S',()=>{
 const run=api(),golden=require('./fixtures/reference-base-resize-new-golden.json');
 for(const g of golden.fixtures){
  const stride=g.width*g.channels+5,last=(g.height-1)*stride+g.width*g.channels,data=new Uint8Array(last).fill(217);
  for(let y=0;y<g.height;y++)data.set(g.data.slice(y*g.width*g.channels,(y+1)*g.width*g.channels),y*stride);
  const before=data.slice(),r=run({data,width:g.width,height:g.height,stride,channels:g.channels,side:g.side,rounding:'nearest-even'});
  assert.deepEqual(r.data,Uint8Array.from(g.expected));assert.deepEqual([r.width,r.height,r.stride,r.channels],[g.side,g.side,g.side*g.channels,g.channels]);
  assert.deepEqual(data,before);assert.notEqual(data.buffer,r.data.buffer);
 }
});
test('base resize 同S copy只活跃行,允许最后row无尾padding',()=>{
 const run=api(),w=5,stride=19,data=Uint8Array.from({length:4*stride+15},(_,i)=>(i*19+31)%256);
 const r=run({data,width:w,height:w,stride,channels:3,side:w,rounding:'nearest-even'});
 for(let y=0;y<5;y++)assert.deepEqual(r.data.slice(y*15,(y+1)*15),data.slice(y*stride,y*stride+15));
 assert.equal(r.data.length,75);const old=data.slice();r.data.fill(0);assert.deepEqual(data,old);
});
test('base resize 精确2x2 mono半BYTE上取,非round-to-even',()=>{
 const run=api(),data=Uint8Array.from([0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2]);
 const r=run({data,width:4,height:4,stride:4,channels:1,side:2,rounding:'nearest-even'});
 assert.deepEqual(Array.from(r.data),[1,1,2,2]);assert.deepEqual(Array.from(data),[0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2]);
});
test('base resize 供给范围/channel/stride/RN严格校验',()=>{
 const run=api(),r={data:new Uint8Array(4),width:2,height:2,stride:2,channels:1,side:2,rounding:'nearest-even'};
 for(const change of [{side:1},{side:1501},{width:1},{width:32767},{height:1},{channels:2},{channels:4},{stride:1},
  {data:new Uint8Array(3)},{rounding:'toward-zero'},{data:new Float32Array(4)},{width:32766,height:32766,stride:32766}])assert.throws(()=>run({...r,...change}));
});
