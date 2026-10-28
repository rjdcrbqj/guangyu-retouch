'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {applyReferenceBaseLUT}=require('../inference/skin-reference/base-lut.cjs');

test('两次基础查表分别覆盖所有BYTE值，保留源padding和独立输出',()=>{
 const width=256,height=5,stride=263,data=new Uint8Array(stride*height+7).fill(173);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*stride+x]=x;
 const before=data.slice();
 for(const stage of ['prepare','finish']){
  const r=applyReferenceBaseLUT({data,width,height,stride,stage});
  assert.deepEqual([r.width,r.height,r.stride,r.mask.length],[width,height,width,width*height]);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const expected=stage==='prepare'?Math.min(255,Math.floor(x*6/5)):(x<100?0:Math.floor((x-100)*51/31));
   assert.equal(r.mask[y*width+x],expected,`${stage}:${x}`);
  }
  r.mask.fill(0);assert.deepEqual(data,before);
 }
});

test('基础查表拒绝不明stage及无效裁剪缓冲，错误时输入不变',()=>{
 const data=new Uint8Array(25).fill(101),r={data,width:5,height:5,stride:5,stage:'finish'},before=data.slice();
 assert.ok(applyReferenceBaseLUT(r).mask.every(x=>x===1));
 for(const patch of [{stage:'both'},{stage:null},{width:4},{height:1501},{width:5.5},{stride:4},{stride:6},{data:new Float32Array(25)},{data:new Uint8Array(24)}])assert.throws(()=>applyReferenceBaseLUT({...r,...patch}),TypeError);
 assert.deepEqual(data,before);
});
