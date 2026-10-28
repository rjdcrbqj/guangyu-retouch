'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const policy={math:'native-byte1-typed-frames-supplied-unit-canvas-generic',rounding:'nearest-even',unmasked:true};
function api(){return require('../inference/skin-reference/typed-frames.cjs').prepareSuppliedTypedReferenceFrames;}
function plane(v,w=5,h=7){return {data:new Uint8Array(w*h).fill(v),width:w,height:h,stride:w,channels:1};}
function record(v,w=5,h=7){return {fullWH:[w,h],origin:[0,0],image:plane(v,w,h)};}
function request(){return {...policy,typedMasks:new Map([[2,record(20)],[6,record(150)],[7,record(10)],[4,record(10)],[1,record(20)]]),unitCanvas:plane(1),photo:{data:Uint8Array.from({length:11*13*3},(_,i)=>(i*17+3)%256),width:11,height:13,stride:33,format:301},weightsFull:{range:new Float32Array(256).fill(1),spatial:new Float32Array(5).fill(1)},weightsMain:{range:new Float32Array(256).fill(1),spatial:new Float32Array(5).fill(1)}};}
function refined(r,value){return require('../inference/skin-reference/base-frame.cjs').refineSuppliedReferenceBase({photo:r.photo,mask:plane(value),rounding:r.rounding,range:r.weightsFull.range,spatial:r.weightsFull.spatial});}
test('typed三路遵循correction/main/current total分流，参考companion仍用更早独立差图',()=>{
 const r=request(),out=api()(r);assert.equal(out.available,true);
 assert.deepEqual(out.packet270,refined(r,12));assert.deepEqual(out.packet160,refined(r,140));assert.deepEqual(out.packet1e8,refined(r,202));
 assert.notEqual(out.packet160.mask.buffer,out.packet1e8.mask.buffer);assert.ok(r.typedMasks.get(6).image.data.every(v=>v===150));
 const companion=require('../inference/skin-reference/typed-mask64.cjs').prepareSuppliedTypedReferenceMask64({typedMasks:r.typedMasks,sourcePhotoWH:[1024,900],ratios:[0,0],rounding:'nearest-even',unmasked:true,math:'native-byte1-add-subtract-code1-code2-generic'});
 assert.ok(companion.mask.data.every(v=>v===170)); // total190-aux20；不能用修正后的202-20。
});
test('aux外层门跳过key7；没有aux时不读取unitCanvas且current total不减aux',()=>{
 const run=api();for(const aux of [undefined,{fullWH:[5,7],image:null}]){
  const r=request();if(aux===undefined)r.typedMasks.delete(1);else r.typedMasks.set(1,aux);
  Object.defineProperty(r,'unitCanvas',{get(){throw Error('aux外层门应绕过canvas');}});
  const out=run(r);assert.equal(out.packet270,null);assert.deepEqual(out.packet160,refined(r,160));assert.deepEqual(out.packet1e8,refined(r,190));
 }
});
test('没有key7时main按aux相减，current total保持原聚合，不读取canvas',()=>{
 const r=request();r.typedMasks.delete(7);Object.defineProperty(r,'unitCanvas',{get(){throw Error('无key7不读canvas');}});
 const out=api()(r);assert.equal(out.packet270,null);assert.deepEqual(out.packet160,refined(r,130));assert.deepEqual(out.packet1e8,refined(r,180));
});
test('typed frames在无total或所需canvas缺失时提前不可用，异WH key7先拒绝',()=>{
 const run=api(),empty={...policy,typedMasks:new Map()};
 for(const key of ['photo','unitCanvas','weightsMain','weightsFull'])Object.defineProperty(empty,key,{get(){throw Error('无total不读后续');}});
 const unavailable={available:false,packet160:null,packet270:null,packet1e8:null};assert.deepEqual(run(empty),unavailable);
 const r=request();delete r.unitCanvas;for(const key of ['photo','weightsMain','weightsFull'])Object.defineProperty(r,key,{get(){throw Error('缺画布不读后续');}});
 assert.deepEqual(run(r),unavailable);
 const mismatch=request();mismatch.typedMasks.set(1,record(9,6,7));Object.defineProperty(mismatch,'photo',{get(){throw Error('异WH先拒绝');}});assert.throws(()=>run(mismatch),/key7/);
 for(const change of [{typedMasks:{}},{math:'guess'},{rounding:'toward-zero'},{unmasked:false}])assert.throws(()=>run({...request(),...change}));
});
test('typed current base精修后与selection相乘进入768，参考companion170独立进入64',async()=>{
 const r=request(),frames=api()(r),{SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 const side=frames.packet1e8.side;assert.equal(side,11);assert.ok(frames.packet1e8.mask.every(v=>v===233));
 r.typedMasks.set(0,{fullWH:[side,side],origin:[1,2],image:{data:new Uint8Array(4).fill(111),width:2,height:2,stride:2}});
 const companion=require('../inference/skin-reference/typed-mask64.cjs').prepareSuppliedTypedReferenceMask64({typedMasks:r.typedMasks,sourcePhotoWH:[1024,800],ratios:[0,0],rounding:'nearest-even',unmasked:true,math:'native-byte1-add-subtract-code1-code2-generic'});
 const original={data:new Uint8Array(side*side*3).fill(128),width:side,height:side,stride:side*3,channels:3};let calls=0;
 const p=new SkinReferenceProcessor({models:{async run(input){calls++;assert.equal(input.currentMask[1537],Math.fround(101*Math.fround(1/255)));assert.equal(input.currentMask[0],0);assert.equal(input.referenceMask[0],Math.fround(170*Math.fround(1/255)));assert.equal(input.referenceMask[4095],Math.fround(170*Math.fround(1/255)));return {coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)};},async close(){}}});
 try{
  const out=await p.run({original,workingPhoto:{...original,format:301},referencePhoto:{data:new Uint8Array(64*64*3).fill(128),width:64,height:64,stride:192,format:301},referenceMask:companion.mask,
   baseMask:{data:frames.packet1e8.mask,width:side,height:side,stride:side},selectionSupply:{typedMasks:r.typedMasks},
   geometry:{valid:true,inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0]),originalROI:Int32Array.from([0,0,2,2])},blendMask:new Uint8Array(4).fill(255),blendMaskStride:2,secondaryTestMask:new Uint8Array(4).fill(255),secondaryTestMaskStride:2,secondaryProtection:new Uint8Array(4).fill(255),secondaryProtectionStride:2,intensity:1,referenceRevision:71});
  assert.equal(calls,1);assert.deepEqual(out.output,original.data);assert.equal(out.referenceRevision,71);
 }finally{await p.close();}
});
