'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const MATH='native-u8-saturating-subtract-generic';
function api(){return require('../inference/skin-reference/mask-subtract.cjs').subtractSuppliedReferenceMasks;}
function mask(data,width,height,stride=width){return {data,width,height,stride};}
test('reference subtract 有向BYTE差值逐像素饱和,不发生低BYTE回绕',()=>{
 const left=mask(Uint8Array.from([3,180,0,255,90,17,254,255]),4,2);
 const right=mask(Uint8Array.from([17,3,255,0,90,254,17,255]),4,2);
 const r=api()({left,right,math:MATH});
 assert.deepEqual(Array.from(r.data),[0,177,0,255,0,0,237,0]);
 assert.deepEqual([r.width,r.height,r.stride],[4,2,4]);
});
test('reference subtract 全BYTE输入对域与16pixel组/尾两种结果一致',()=>{
 const left=new Uint8Array(65536),right=new Uint8Array(65536),expected=new Uint8Array(65536);
 for(let a=0;a<256;a++)for(let b=0;b<256;b++){
  const i=a*256+b;left[i]=a;right[i]=b;expected[i]=a>=b?a-b:0;
 }
 const r=api()({left:mask(left,256,256),right:mask(right,256,256),math:MATH});
 assert.deepEqual(r.data,expected);assert.deepEqual(left.slice(255*256),new Uint8Array(256).fill(255));
 assert.deepEqual(right.slice(0,256),Uint8Array.from({length:256},(_,i)=>i));
});
test('reference subtract 独立stride/nonzero view/最后有效行与whole1返回私有data',()=>{
 const backing=new Uint8Array(30).fill(221),left=backing.subarray(7,18);
 left.set([99,31,88,221,52,231,255,221,9,2,2]);
 const other=Uint8Array.from([2,9,7,219,218,80,251,128,217,216,7,9,3]);
 const before=backing.slice(),otherBefore=other.slice();
 const r=api()({left:mask(left,3,3,4),right:mask(other,3,3,5),math:MATH});
 assert.deepEqual(Array.from(r.data),[97,22,81,0,0,127,2,0,0]);
 r.data.fill(0);assert.deepEqual(backing,before);assert.deepEqual(other,otherBefore);
 const one=api()({left:mask(Uint8Array.of(33),1,1),right:mask(Uint8Array.of(5),1,1),math:MATH});
 assert.deepEqual(Array.from(one.data),[28]);
});
test('reference subtract 尺寸/shape/布局/类型和数学声明错误拒绝',()=>{
 const run=api(),left=mask(Uint8Array.of(4,5,6,7),2,2),right=mask(Uint8Array.of(3,4,5,6),2,2),r={left,right,math:MATH};
 for(const change of [{math:'ordinary-minus'},{left:null},{right:{...right,width:1}},
  {left:{...left,width:0}},{right:{...right,stride:1}},{left:{...left,data:new Float32Array(4)}},
  {right:{...right,data:new Uint8Array(3)}},{left:{...left,width:32767}},{right:{...right,stride:Number.MAX_SAFE_INTEGER}}])assert.throws(()=>run({...r,...change}));
 assert.throws(()=>run(null));assert.deepEqual(Array.from(left.data),[4,5,6,7]);assert.deepEqual(Array.from(right.data),[3,4,5,6]);
});
