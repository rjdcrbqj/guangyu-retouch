'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const math='native-u8-roi-copy';
function api(){return require('../inference/skin-reference/mask-record.cjs');}
function record(data=[7,11,19,23],fullWH=[5,4],origin=[2,1]){
 return {fullWH,origin,image:{data:Uint8Array.from(data),width:2,height:2,stride:2}};
}
test('局部BYTE1记录按原点写入完整画布，外围为零，不改变输入',()=>{
 const r=record(),before=r.image.data.slice();
 const out=api().materializeSuppliedReferenceMask({record:r,math});
 assert.deepEqual([out.width,out.height,out.stride],[5,4,5]);
 assert.deepEqual(Array.from(out.data),[0,0,0,0,0,0,0,7,11,0,0,0,19,23,0,0,0,0,0,0]);
 out.data.fill(99);assert.deepEqual(r.image.data,before);
});
test('非零view与独立stride只复制有效列，末行不要求尾部padding',()=>{
 const bytes=Uint8Array.from([201,202,3,5,203,204,13,17,205]);
 const r=record();r.image={data:bytes.subarray(2,8),width:2,height:2,stride:4};
 const out=api().materializeSuppliedReferenceMask({record:r,math});
 assert.deepEqual(Array.from(out.data),[0,0,0,0,0,0,0,3,5,0,0,0,13,17,0,0,0,0,0,0]);
 assert.deepEqual(Array.from(bytes),[201,202,3,5,203,204,13,17,205]);
});
test('零原点同尺寸和单像素记录均返回私有packed缓冲',()=>{
 const r=record([1,2,3,4],[2,2],[0,0]);
 const out=api().materializeSuppliedReferenceMask({record:r,math});
 assert.deepEqual(out.data,r.image.data);assert.notEqual(out.data.buffer,r.image.data.buffer);
 const one={fullWH:[1,1],origin:[0,0],image:{data:Uint8Array.of(83),width:1,height:1,stride:1}};
 assert.deepEqual(Array.from(api().materializeSuppliedReferenceMask({record:one,math}).data),[83]);
});
test('typed键0优先，无需读取人脸或实例供给',()=>{
 const r=record(),request={typedMasks:new Map([[0,r]]),math};
 for(const key of ['instanceMasks','faceOrdinals','faceId'])Object.defineProperty(request,key,{get(){throw Error('不得读取fallback');}});
 assert.equal(api().selectSuppliedReferenceMask(request).data[7],7);
});
test('typed键存在但记录无效时返回不可用，不落入实例且不制造零mask',()=>{
 for(const r of [null,{image:null},{image:{width:0,height:2}}]){
  const request={typedMasks:new Map([[0,r]]),math};
  Object.defineProperty(request,'instanceMasks',{get(){throw Error('不得fallback');}});
  assert.equal(api().selectSuppliedReferenceMask(request),null);
 }
 assert.equal(api().materializeSuppliedReferenceMask({record:null,math}),null);
});
test('typed0缺失才用有符号faceID映射到实例ordinal，不能把ID当下标',()=>{
 const request={typedMasks:new Map([[9,record()]]),instanceMasks:[record([1,1,1,1]),record([31,37,41,43])],faceOrdinals:new Map([[-17,1]]),faceId:-17,math};
 assert.equal(api().selectSuppliedReferenceMask(request).data[7],31);
 assert.equal(api().selectSuppliedReferenceMask({...request,faceId:1}),null);
 assert.equal(api().selectSuppliedReferenceMask({...request,faceOrdinals:new Map([[-17,8]])}),null);
 assert.equal(api().selectSuppliedReferenceMask({...request,instanceMasks:[]}),null);
 assert.equal(api().selectSuppliedReferenceMask({...request,instanceMasks:[null,null]}),null);
});
test('越界ROI拒绝，不能偷偷截断或缩放；不支持的布局和声明拒绝',()=>{
 const {materializeSuppliedReferenceMask,selectSuppliedReferenceMask}=api();
 const run=r=>materializeSuppliedReferenceMask({record:r,math});
 for(const r of [record(undefined,[5,4],[-1,0]),record(undefined,[5,4],[4,0]),record(undefined,[5,4],[0,3]),record(undefined,[0,4]),record(undefined,[5,4],[0.5,0])])assert.throws(()=>run(r));
 for(const image of [{data:new Float32Array(4),width:2,height:2,stride:2},{data:new Uint8Array(3),width:2,height:2,stride:2},{data:new Uint8Array(4),width:2,height:2,stride:1},{data:new Uint8Array(4),width:2,height:2,stride:2,channels:3}])assert.throws(()=>run({...record(),image}));
 assert.throws(()=>materializeSuppliedReferenceMask({record:record(),math:'resize'}));
 assert.throws(()=>selectSuppliedReferenceMask({typedMasks:{0:record()},math}));
 assert.throws(()=>selectSuppliedReferenceMask({typedMasks:new Map(),faceId:2147483648,faceOrdinals:new Map(),instanceMasks:[],math}));
});
