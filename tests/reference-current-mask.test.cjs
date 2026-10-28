'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('模型mask forward以flags0逐F32组合并经DOUBLE正零归一',()=>{
 const {composeReferenceMaskForward}=require('../inference/skin-reference/current-mask.cjs');
 const inputForward=Float32Array.from([1.25,-.5,-0,-.75,2.25,-0]);
 const output=composeReferenceMaskForward({inputForward,photoWidth:6,photoHeight:10,maskWidth:4,maskHeight:4,rounding:'nearest-even'});
 assert.deepEqual(output,Float32Array.from([1.875,-1.25,0,-1.125,5.625,0]));
 assert.ok(Object.is(output[2],0)&&Object.is(output[5],0));assert.ok(Object.is(inputForward[2],-0));assert.notEqual(output,inputForward);
});
test('供应mono mask768保留BYTE边缘零插值和独立stride',()=>{
 const {samplePreparedReferenceMask}=require('../inference/skin-reference/current-mask.cjs');
 const data=new Uint8Array([10,20,99,30,40,99]),mask={data,width:2,height:2,stride:3},before=data.slice();
 const sample=tx=>samplePreparedReferenceMask({mask,currentPhotoWH:[2,2],geometry:{valid:true,inputForward:Float32Array.from([1,0,tx,0,1,0])},rounding:'nearest-even'});
 const plain=sample(0),expected=new Uint8Array(768*768);expected.set([10,20],0);expected.set([30,40],768);
 assert.deepEqual(plain.data,expected);assert.equal(plain.width,768);assert.equal(plain.height,768);assert.equal(plain.stride,768);
 const half=sample(.5),shifted=new Uint8Array(768*768);shifted.set([5,15,10],0);shifted.set([15,35,20],768);
 assert.deepEqual(half.data,shifted);assert.deepEqual(data,before);half.data[0]=255;assert.equal(data[0],10);
});
test('未知固定点域、错误layout/WH、非有限矩阵和未声明舍入拒绝',()=>{
 const {samplePreparedReferenceMask}=require('../inference/skin-reference/current-mask.cjs');
 const r={mask:{data:new Uint8Array(4).fill(200),width:2,height:2,stride:2},currentPhotoWH:[2,2],geometry:{valid:true,inputForward:Float32Array.from([1,0,0,0,1,0])},rounding:'nearest-even'};
 for(const patch of [{rounding:undefined},{currentPhotoWH:[1,2]},{mask:{...r.mask,stride:1}},{geometry:{...r.geometry,valid:false}},
  {geometry:{valid:true,inputForward:Float32Array.from([NaN,0,0,0,1,0])}},
  {geometry:{valid:true,inputForward:Float32Array.from([1,0,3e7,0,1,0])}}])assert.throws(()=>samplePreparedReferenceMask({...r,...patch}));
 assert.deepEqual(r.mask.data,new Uint8Array(4).fill(200));
});
