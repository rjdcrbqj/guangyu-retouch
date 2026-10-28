'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('新photo64/maskPatch64供给连到四输入mock作业,参考64各自处理后才F32打包',async()=>{
 const {prepareSuppliedReferencePhoto64}=require('../inference/skin-reference/photo64.cjs');
 const {prepareSuppliedReferenceMask64}=require('../inference/skin-reference/mask64.cjs');
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 const raw=new Uint8Array(3*5*3);for(let i=0;i<raw.length;i+=3)raw.set([40,80,120],i);
 const referencePhoto=prepareSuppliedReferencePhoto64({data:raw,width:3,height:5,stride:9,format:300,rounding:'nearest-even'});
 const selection=Uint8Array.from([0,64,128,255]);
 const patch=prepareSuppliedReferenceMask64({mask:{data:selection,width:2,height:2,stride:2},ratios:[0,0],currentPhotoWH:[3,5],math:'native-code2-scalar'});
 assert.equal(patch.valid,true);assert.deepEqual(Array.from(patch.ROI),[0,0,2,2]);assert.equal(patch.mask.data[4095],253);
 const frame=new Uint8Array(20*5+4).fill(211);for(let y=0;y<5;y++)frame.fill(41,y*20,y*20+18);
 const before=frame.slice(),area=768*768;let calls=0,releases=0;
 const backend={async run(input){
  calls++;assert.equal(input.photo.length,area*3);assert.equal(input.currentMask.length,area);
  assert.equal(input.reference.length,12288);assert.equal(input.referenceMask.length,4096);
  assert.equal(input.reference[0],-0.05882353335618973); // physical300的120通道只在pack时交换。
  assert.equal(input.referenceMask[0],0);assert.equal(input.referenceMask[4095],0.9921569228172302);
  return {coefficients:new Float32Array(area*9),mask:new Float32Array(area).fill(-1)};
 },async close(){releases++;}};
 const processor=new SkinReferenceProcessor({models:backend});
 const result=await processor.run({original:{data:frame,width:6,height:5,stride:20,channels:3},
  workingPhoto:{data:new Uint8Array(6*5*3).fill(77),width:6,height:5,stride:18,format:301},
  temporaryMask:{data:new Uint8Array(3*4).fill(255),width:3,height:4,stride:3},referencePhoto,referenceMask:patch.mask,
  geometry:{valid:true,inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0]),originalROI:Int32Array.from([2,1,2,2])},
  blendMask:new Uint8Array(4).fill(255),blendMaskStride:2,secondaryTestMask:new Uint8Array(4).fill(255),secondaryTestMaskStride:2,intensity:1,referenceRevision:43});
 assert.equal(calls,1);assert.equal(result.referenceRevision,43);assert.equal(result.secondary.trigger,false);
 assert.deepEqual(result.output,before);assert.deepEqual(frame,before);assert.deepEqual(selection,Uint8Array.from([0,64,128,255]));
 for(let i=0;i<raw.length;i+=3)assert.deepEqual(Array.from(raw.slice(i,i+3)),[40,80,120]);
 await processor.close();assert.equal(releases,1);
});
