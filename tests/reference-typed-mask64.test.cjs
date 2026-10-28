'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const policy={math:'native-byte1-add-subtract-code1-code2-generic',rounding:'nearest-even',unmasked:true};
function api(){return require('../inference/skin-reference/typed-mask64.cjs').prepareSuppliedTypedReferenceMask64;}
function record(value,side=3){return {fullWH:[side,side],origin:[0,0],image:{data:new Uint8Array(side*side).fill(value),width:side,height:side,stride:side}};}
function request(typedMasks){return {typedMasks,sourcePhotoWH:[1024,700],ratios:[0,0],...policy};}
test('参考companion按指定typed集合相加再减aux1，不读取当前selection key0',()=>{
 const ignored={get image(){throw Error('不得读取非companion key');}};
 const r=request(new Map([[2,record(100)],[6,record(80)],[1,record(20)],[0,ignored],[99,ignored]]));
 const out=api()(r);assert.equal(out.available,true);assert.equal(out.valid,true);assert.equal(out.source,'aggregate-minus-auxiliary');
 assert.deepEqual(Array.from(out.scaledWH),[3,3]);assert.deepEqual(Array.from(out.ROI),[0,0,3,3]);assert.ok(out.mask.data.every(v=>v===160));
 assert.ok(r.typedMasks.get(2).image.data.every(v=>v===100));assert.equal(r.typedMasks.size,5);
});
test('饱和加法在减法之前，覆盖主集合与附加集合末端',()=>{
 const r=request(new Map([[2,record(200)],[13,record(70)],[5,record(30)],[1,record(50)]]));
 const out=api()(r);assert.ok(out.mask.data.every(v=>v===205));
 // 若减法提前，结果会变250。另单独检查附加集合末端5没有遗漏。
 const extra=api()(request(new Map([[5,record(33)],[1,record(10)]])));assert.ok(extra.mask.data.every(v=>v===23));
});
test('aux1缺失或无图像时走有效aggregate，不制造缺失mask',()=>{
 const run=api();for(const aux of [undefined,null,{fullWH:[3,3],image:null}]){
  const map=new Map([[4,record(23)]]);if(aux!==undefined)map.set(1,aux);
  const out=run(request(map));assert.equal(out.source,'aggregate');assert.ok(out.mask.data.every(v=>v===23));
 }
});
test('aux1有效但不同fullWH时保留原aggregate备用选路',()=>{
 const out=api()(request(new Map([[2,record(37)],[1,record(250,2)]])));
 assert.equal(out.source,'aggregate');assert.deepEqual(Array.from(out.scaledWH),[3,3]);assert.ok(out.mask.data.every(v=>v===37));
});
test('没有聚合图返回不可用且不读照片坐标；真实空裁剪仍available',()=>{
 const run=api(),r={typedMasks:new Map([[0,record(255)],[1,record(255)]]),...policy};
 for(const key of ['sourcePhotoWH','ratios'])Object.defineProperty(r,key,{get(){throw Error('不得读取缺失上游');}});
 assert.deepEqual(run(r),{available:false,valid:false,mask:null,source:null});
 const cropped=run({...request(new Map([[2,record(71,4)]])),sourcePhotoWH:[2048,1024],ratios:[.5,.5]});
 assert.equal(cropped.available,true);assert.equal(cropped.valid,false);assert.equal(cropped.mask,null);assert.equal(cropped.source,'aggregate');
});
test('输入限定unmasked generic BYTE1，错误声明或彩色供给拒绝',()=>{
 const run=api(),r=request(new Map([[2,record(19)]]));
 for(const patch of [{math:'max'},{unmasked:false},{rounding:'toward-zero'},{typedMasks:{}},{sourcePhotoWH:[100,100]}])assert.throws(()=>run({...r,...patch}));
 const color=record(19);color.image.channels=3;assert.throws(()=>run(request(new Map([[2,color]]))));
 const conflict=record(19,2);assert.throws(()=>run(request(new Map([[2,record(19)],[6,conflict]]))));
});
test('aux1异尺寸且key7有效时拒绝尚未闭合的后续修正，不返回未经核实的aggregate',()=>{
 const run=api(),r=request(new Map([[2,record(37)],[7,record(5)],[1,record(250,2)]]));
 for(const key of ['sourcePhotoWH','ratios'])Object.defineProperty(r,key,{get(){throw Error('不应进入坐标准备');}});
 assert.throws(()=>run(r),/key7/);
 // 没有aux图像时不会进入该原分支，仍保留已证的聚合路径。
 const safe=run(request(new Map([[2,record(37)],[7,record(5)],[1,{fullWH:[2,2],image:null}]])));
 assert.equal(safe.source,'aggregate');assert.ok(safe.mask.data.every(v=>v===42));
});
