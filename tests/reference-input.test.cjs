'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let implementation;try{implementation=require('../inference/skin-reference/input.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

// 这些字面位模式来自分步IEEE754手算，未调用被测归一化器。
function fixture(){
 const photo={data:new Uint8Array(768*(768*3+5)).fill(90),width:768,height:768,stride:768*3+5,format:301};
 const reference={data:new Uint8Array(64*(64*3+7)).fill(90),width:64,height:64,stride:64*3+7,format:300};
 const currentMask={data:new Uint8Array(768*(768+3)).fill(255),width:768,height:768,stride:768+3};
 const referenceMask={data:new Uint8Array(64*(64+2)).fill(255),width:64,height:64,stride:64+2};
 return {photo,currentMask,reference,referenceMask};
}
function bits(array){return new Uint32Array(array.buffer,array.byteOffset,array.length);}

test('explicit four inputs pack physical channels and skip row padding',()=>{
 assert.equal(typeof implementation?.packInputs,'function','reference packer is missing');
 const inputs=fixture(),{photo,reference,currentMask,referenceMask}=inputs;
 photo.data.set([0,127,128,255,128,127]);photo.data.set([255,0,128],photo.stride);
 reference.data.set([0,127,255]);reference.data.set([255,128,0],reference.stride);
 currentMask.data.set([0,127,128,255]);referenceMask.data.set([128,127]);
 const out=implementation.packInputs(inputs),p=bits(out.photo),r=bits(out.reference),m=bits(out.currentMask),rm=bits(out.referenceMask);
 assert.deepEqual(Object.keys(out),['photo','currentMask','reference','referenceMask']);
 assert.equal(out.photo.length,3*768*768);assert.equal(out.reference.length,3*64*64);assert.equal(out.currentMask.length,768*768);assert.equal(out.referenceMask.length,64*64);
 assert.deepEqual([p[0],p[768*768],p[2*768*768]],[0xbf800000,0xbb808081,0x3b808081]);
 assert.deepEqual([p[1],p[768*768+1],p[2*768*768+1]],[0x3f800000,0x3b808081,0xbb808081]);
 assert.deepEqual([p[768],p[768*768+768],p[2*768*768+768]],[0x3f800000,0xbf800000,0x3b808081]);
 assert.deepEqual([r[0],r[64*64],r[2*64*64]],[0x3f800000,0xbb808081,0xbf800000]);
 assert.deepEqual([r[64],r[64*64+64],r[2*64*64+64]],[0xbf800000,0x3b808081,0x3f800000]);
 assert.deepEqual(Array.from(m.slice(0,4)),[0,0x3efeff00,0x3f008081,0x3f800000]);
 assert.deepEqual(Array.from(rm.slice(0,2)),[0x3f008081,0x3efeff00]);
 const first=out.photo[0];photo.data[0]=255;assert.equal(out.photo[0],first,'result must own its buffer');
});

test('input dimensions, storage and format fail before producing tensors',()=>{
 assert.equal(typeof implementation?.packInputs,'function','reference packer is missing');
 for(const [field,patch] of [
  ['photo',{width:64}],['reference',{height:768}],['currentMask',{width:64}],['referenceMask',{height:768}],
  ['photo',{format:401}],['reference',{format:999}],['photo',{stride:2303}],['currentMask',{stride:767}],
  ['reference',{stride:192.5}],['referenceMask',{data:new Uint8Array(1)}],['photo',{data:new Float32Array(768*768*3)}]
 ]){const inputs=fixture();Object.assign(inputs[field],patch);assert.throws(()=>implementation.packInputs(inputs),undefined,field+JSON.stringify(patch));}
 assert.throws(()=>implementation.packInputs(null));
});

test('current affine samples retain fractional Float32 planar values before normalization',()=>{
 assert.equal(typeof implementation?.packInputs,'function','reference packer is missing');
 const inputs=fixture(),area=768*768;
 inputs.photo={data:new Float32Array(3*area).fill(127.5),width:768,height:768,layout:'CHW',format:301};
 inputs.photo.data[0]=127.25;inputs.photo.data[area]=127.75;inputs.photo.data[2*area]=255;
 const out=implementation.packInputs(inputs),p=bits(out.photo);
 assert.deepEqual([p[0],p[area],p[2*area]],[0xbb008081,0x3b008081,0x3f800000]);
 assert.equal(p[1],0);inputs.photo.data[0]=NaN;assert.throws(()=>implementation.packInputs(inputs));
 inputs.photo.data[0]=127.25;inputs.photo.layout='HWC';assert.throws(()=>implementation.packInputs(inputs));
});
