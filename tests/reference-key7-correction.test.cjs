'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const policy={math:'native-byte1-key7-supplied-unit-canvas-generic',rounding:'nearest-even',unmasked:true};
function api(){return require('../inference/skin-reference/key7-correction.cjs').applySuppliedReferenceKey7Correction;}
function plane(values,width=values.length,height=1,stride=width){return {data:Uint8Array.from(values),width,height,stride,channels:1};}
function request(){return {...policy,aggregate:plane([10,20,30,40,50,60]),key7:plane([0,1,2,10,200,255]),auxiliary:plane([8,1,0,2,0,255]),unitCanvas:plane([1,1,1,1,1,1])};}
test('key7正值与aux正值相交，未相交保留1，独立输出修正和饱和累加图',()=>{
 const r=request(),out=api()(r);
 assert.equal(out.available,true);assert.deepEqual([...out.correction.data],[1,1,1,12,1,255]);
 assert.deepEqual([...out.base.data],[11,21,31,52,51,255]);assert.equal(out.base.stride,6);
 assert.notEqual(out.base.data.buffer,out.correction.data.buffer);assert.deepEqual([...r.aggregate.data],[10,20,30,40,50,60]);
 out.correction.data[0]=99;assert.equal(out.base.data[0],11);assert.equal(r.unitCanvas.data[0],1);
});
test('key7全部256值查表使用F32乘1.2后截断，不受局部裁剪最小尺寸约束',()=>{
 const r={...policy,aggregate:plane(new Array(256).fill(0),256),key7:plane(Array.from({length:256},(_,i)=>i),256),auxiliary:plane(new Array(256).fill(1),256),unitCanvas:plane(new Array(256).fill(1),256)};
 const out=api()(r),expected=Array.from({length:256},(_,i)=>i===0?1:Math.trunc(Math.min(255,Math.fround(Math.fround(i)*Math.fround(1.2)))));
 assert.deepEqual([...out.correction.data],expected);assert.deepEqual([...out.base.data],expected);
});
test('key7有效行支持stride与偏移共享视图，忽略padding且输出不借用输入',()=>{
 const run=api(),shared=new SharedArrayBuffer(20),view=new Uint8Array(shared,3,11);view.set([5,6,7,99,99,8,9,10,99,99,99]);
 const r={...policy,aggregate:{data:view,width:3,height:2,stride:5},key7:plane([2,3,4,255,255,5,6,7],3,2,5),auxiliary:plane([1,1,1,0,0,1,1,1],3,2,5),unitCanvas:plane([1,1,1,99,99,1,1,1],3,2,5)};
 const out=run(r);assert.deepEqual([...out.correction.data],[2,3,4,6,7,8]);assert.deepEqual([...out.base.data],[7,9,11,14,16,18]);
 view.fill(0);r.key7.data.fill(0);assert.deepEqual([...out.base.data],[7,9,11,14,16,18]);assert.ok(out.base.data.buffer instanceof ArrayBuffer);
});
test('缺失actual unitCanvas时返回不可用，不读其余尚未供应的图像',()=>{
 const run=api();for(const unitCanvas of [undefined,null]){
  const r={...policy,unitCanvas};for(const key of ['aggregate','key7','auxiliary'])Object.defineProperty(r,key,{get(){throw Error('缺失画布不得读取后续图像');}});
  assert.deepEqual(run(r),{available:false,base:null,correction:null});
 }
});
test('拒绝非全1有效画布、彩色、异尺寸、错误深度或缺损行，绝不制造fallback',()=>{
 const run=api();
 const badCanvas=request();badCanvas.unitCanvas.data[2]=0;assert.throws(()=>run(badCanvas),/全1|unitCanvas/);
 for(const key of ['aggregate','key7','auxiliary','unitCanvas']){
  for(const change of [{channels:3},{depth:'uint16'},{height:2},{stride:0},{data:new Uint16Array(6)}]){
   const r=request();r[key]={...r[key],...change};assert.throws(()=>run(r),key+JSON.stringify(change));
  }
 }
 const r=request();r.key7=plane([1,2,3],3);assert.throws(()=>run(r),/WH|尺寸/);
});
test('key7修正只接受明确unmasked generic与nearest-even声明',()=>{
 const run=api();for(const change of [{math:'guess'},{rounding:'toward-zero'},{unmasked:false}])assert.throws(()=>run({...request(),...change}));
});
