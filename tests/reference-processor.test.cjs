'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function fixture(){
 const original={data:new Uint8Array(19*4).fill(177),width:4,height:4,stride:19,channels:4};
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)original.data.set([128,128,128,211],y*19+x*4);
 const referencePhoto={data:new Uint8Array(193*64).fill(171),width:64,height:64,stride:193,format:300};
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)referencePhoto.data.set([0,127,255],y*193+x*3);
 return {original,workingPhoto:{data:new Uint8Array(48).fill(128),width:4,height:4,stride:12,format:301},temporaryMask:{data:new Uint8Array(16).fill(255),width:4,height:4,stride:4},
  referencePhoto,referenceMask:{data:new Uint8Array(64*64).fill(255),width:64,height:64,stride:64},
  geometry:{valid:true,inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0]),originalROI:Int32Array.from([1,1,2,2])},
  blendMask:new Uint8Array(4).fill(255),blendMaskStride:2,secondaryTestMask:new Uint8Array(4).fill(255),secondaryTestMaskStride:2,
  secondaryProtection:new Uint8Array(4).fill(255),secondaryProtectionStride:2,intensity:1,referenceRevision:7};
}
function heads(delta=0){
 const area=768*768,coefficients=new Float32Array(9*area);
 if(delta)for(let ch=0;ch<3;ch++)coefficients.fill(-(delta-.25)/128,(ch*3+ch)*area,(ch*3+ch+1)*area);
 return {coefficients,mask:new Float32Array(area).fill(1)};
}
test('异步作业连接working两采样与四输入，保留64物理交换和原完整buffer',async()=>{
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 let calls=0;const backend={async run(input){calls++;assert.equal(input.photo.length,3*768*768);assert.equal(input.currentMask.length,768*768);
  assert.equal(input.reference.length,3*64*64);assert.equal(input.referenceMask.length,64*64);assert.equal(input.currentMask[0],1);assert.equal(input.referenceMask[0],1);
  assert.equal(input.reference[0],1);assert.equal(input.reference[2*64*64],-1);assert.equal(input.photo[0],0.003921568859368563);return heads();},async close(){}};
 const r=fixture(),before=r.original.data.slice();Object.defineProperty(r,'colorMap',{get(){throw Error('optional false payload read');}});
 const p=new SkinReferenceProcessor({models:backend}),out=await p.run(r);
 assert.equal(calls,1);assert.deepEqual(out.output,before);assert.equal(out.referenceRevision,7);assert.equal(out.secondary.trigger,false);assert.deepEqual(r.original.data,before);await p.close();
});
test('首await前快照整个结果供给，延迟model期间修改用户数据不改变提交作业',async()=>{
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 let complete;const gate=new Promise(resolve=>{complete=resolve;});const p=new SkinReferenceProcessor({models:{async run(){await gate;return heads(26);},async close(){}}});
 const r=fixture(),before=r.original.data.slice(),job=p.run(r);
 r.original.data.fill(0);r.workingPhoto.data.fill(0);r.temporaryMask.data.fill(0);r.referencePhoto.data.fill(0);r.referenceMask.data.fill(0);
 r.geometry.originalROI.fill(0);r.geometry.postAffine.fill(0);r.blendMask.fill(0);r.secondaryTestMask.fill(0);r.secondaryProtection.fill(0);r.intensity=0;r.referenceRevision=8;
 complete();const out=await job,expected=before.slice();for(let y=1;y<3;y++)for(let x=1;x<3;x++)expected.set([112,112,112],y*19+x*4);
 assert.deepEqual(out.output,expected);assert.equal(out.referenceRevision,7);assert.equal(out.appliedIntensity,Math.fround(.65));assert.deepEqual(out.secondary,{score:104000n,count:4n,trigger:true});await p.close();
});
test('busy与close覆盖整个作业，只关闭一次并等待，关闭后拒绝',async()=>{
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 let complete,released=0;const gate=new Promise(resolve=>{complete=resolve;});const p=new SkinReferenceProcessor({models:{async run(){await gate;return heads();},async close(){released++;}}});
 const job=p.run(fixture());await assert.rejects(p.run(fixture()),/busy/);const closed=p.close();assert.equal(p.close(),closed);assert.equal(released,0);
 await assert.rejects(p.run(fixture()),/closed/);complete();await job;await closed;assert.equal(released,1);
});
test('非法输入不调用后端，后端失败后新提交可继续',async()=>{
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 let calls=0;const p=new SkinReferenceProcessor({models:{async run(){calls++;if(calls===1)throw Error('new mock failure');return heads();},async close(){}}});
 await assert.rejects(p.run({...fixture(),referenceRevision:-1}));const r=fixture();r.referenceMask.height=63;await assert.rejects(p.run(r));assert.equal(calls,0);
 await assert.rejects(p.run(fixture()),/new mock failure/);const out=await p.run(fixture());assert.equal(calls,2);assert.equal(out.referenceRevision,7);await p.close();
});

test('原frame/结果掩码/强度必需供给错误在模型之前拒绝',async()=>{
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 let calls=0;const p=new SkinReferenceProcessor({models:{async run(){calls++;return heads();},async close(){}}}),r=fixture();
 for(const patch of [{original:{...r.original,data:new Uint8Array(1)}},{intensity:'1'},{blendMask:new Uint8Array(1)},
  {secondaryTestMask:new Uint8Array(1)},{geometry:{...r.geometry,originalROI:Int32Array.from([3,3,2,2])}},{geometry:{...r.geometry,postAffine:new Float32Array(1)}}]){
  await assert.rejects(p.run({...r,...patch}));assert.equal(calls,0);
 }
 await p.close();
});

test('SharedArrayBuffer typed输入也按值快照，不能在await期间变更结果源或ROI',async()=>{
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 const r=fixture(),before=r.original.data.slice();
 const shared=(Type,data)=>{const out=new Type(new SharedArrayBuffer(data.byteLength));out.set(data);return out;};
 r.original.data=shared(Uint8Array,r.original.data);r.geometry.originalROI=shared(Int32Array,r.geometry.originalROI);r.geometry.postAffine=shared(Float32Array,r.geometry.postAffine);
 for(const key of ['blendMask','secondaryTestMask','secondaryProtection'])r[key]=shared(Uint8Array,r[key]);
 let complete;const gate=new Promise(resolve=>{complete=resolve;});const p=new SkinReferenceProcessor({models:{async run(){await gate;return heads(26);},async close(){}}});
 const job=p.run(r);r.original.data.fill(0);r.geometry.originalROI.set([0,0,2,2]);r.geometry.postAffine.fill(0);
 r.blendMask.fill(0);r.secondaryTestMask.fill(0);r.secondaryProtection.fill(0);complete();
 const out=await job,expected=before.slice();for(let y=1;y<3;y++)for(let x=1;x<3;x++)expected.set([112,112,112],y*19+x*4);
 assert.deepEqual(out.output,expected);assert.deepEqual(out.ROI,[1,1,2,2]);assert.equal(out.referenceRevision,7);await p.close();
});
