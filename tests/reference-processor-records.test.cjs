'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
function fixture(){
 return {original:{data:new Uint8Array(4*4*3).fill(128),width:4,height:4,stride:12,channels:3},
  workingPhoto:{data:new Uint8Array(48).fill(128),width:4,height:4,stride:12,format:301},
  referencePhoto:{data:new Uint8Array(64*64*3).fill(128),width:64,height:64,stride:192,format:301},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  baseMask:{data:new Uint8Array(20).fill(131),width:4,height:4,stride:5},
  selectionSupply:{typedMasks:new Map([[0,{fullWH:[4,4],origin:[1,1],image:{data:Uint8Array.of(199,199,199,199),width:2,height:2,stride:2}}]])},
  geometry:{valid:true,inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0]),originalROI:Int32Array.from([0,0,2,2])},
  blendMask:new Uint8Array(4).fill(255),blendMaskStride:2,secondaryTestMask:new Uint8Array(4).fill(255),secondaryTestMaskStride:2,
  secondaryProtection:new Uint8Array(4).fill(255),secondaryProtectionStride:2,intensity:1,referenceRevision:12};
}
test('作业以记录选路→完整画布→base相乘→768采样→四输入，保留已有参考64',async()=>{
 const r=fixture(),original=r.original.data.slice(),recordBefore=r.selectionSupply.typedMasks.get(0).image.data.slice();
 let calls=0;const p=new SkinReferenceProcessor({models:{async run(input){
  calls++;assert.equal(input.currentMask[0],0);assert.equal(input.currentMask[769],Math.fround(102*Math.fround(1/255)));
  assert.equal(input.currentMask[770],Math.fround(102*Math.fround(1/255)));assert.equal(input.currentMask[771],0);
  assert.equal(input.currentMask[1537],Math.fround(102*Math.fround(1/255)));assert.equal(input.currentMask[2305],0);
  assert.equal(input.referenceMask[0],1);assert.equal(input.referenceMask[4095],1);
  return {coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)};
 },async close(){}}});
 const out=await p.run(r);assert.equal(calls,1);assert.deepEqual(out.output,original);assert.equal(out.referenceRevision,12);
 assert.deepEqual(r.selectionSupply.typedMasks.get(0).image.data,recordBefore);assert.ok(r.baseMask.data.every(v=>v===131));await p.close();
});
test('记录缺失/typed无效/基础画布不符/两种供给冲突均在模型前拒绝',async()=>{
 let calls=0;const p=new SkinReferenceProcessor({models:{async run(){calls++;throw Error('不应调用模型');},async close(){}}});
 const changes=[{selectionSupply:{typedMasks:new Map([[0,null]])}},
  {selectionSupply:{typedMasks:new Map(),instanceMasks:[],faceOrdinals:new Map(),faceId:25}},
  {baseMask:{data:new Uint8Array(16),width:2,height:4,stride:4}},
  {temporaryMask:{data:new Uint8Array(16),width:4,height:4,stride:4}},
  {baseMask:undefined},{selectionSupply:undefined}];
 for(const change of changes){await assert.rejects(p.run({...fixture(),...change}));assert.equal(calls,0);}
 await p.close();
});
test('实例分支用真实faceID映射，Map内共享BYTE记录也在模型前变成私有输入',async()=>{
 const r=fixture(),image=new Uint8Array(new SharedArrayBuffer(4));image.fill(255);
 r.selectionSupply={typedMasks:new Map(),instanceMasks:[{fullWH:[4,4],origin:[1,1],image:{data:image,width:2,height:2,stride:2}}],faceOrdinals:new Map([[-29,0]]),faceId:-29};
 let complete,calls=0;const gate=new Promise(resolve=>{complete=resolve;});
 const p=new SkinReferenceProcessor({models:{async run(input){calls++;await gate;
  assert.equal(input.currentMask[769],Math.fround(131*Math.fround(1/255)));assert.equal(input.currentMask[0],0);
  return {coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)};
 },async close(){}}});
 const job=p.run(r);image.fill(0);r.selectionSupply.faceOrdinals.clear();r.baseMask.data.fill(0);complete();
 const out=await job;assert.equal(calls,1);assert.equal(out.referenceRevision,12);await p.close();
});
