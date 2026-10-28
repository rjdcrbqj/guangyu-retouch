'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let stage;try{stage=require('../inference/skin-reference/current-photo.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function fixture(){return {photo:{data:new Uint8Array([0,10,20,100,110,120,173,173,173,200,210,220,255,254,253,173,173,173]),width:2,height:2,stride:9,format:301},geometry:{valid:true,inputForward:Float32Array.from([2,0,0,0,2,0]),postAffine:Float32Array.from([99,0,0,0,99,0])}};}
test('当前采样使用forward再求逆，保留CHW小数与完整2x2边缘规则',()=>{
 assert.equal(typeof stage?.samplePreparedReferencePhoto,'function','current reference photo stage is missing');
 const r=fixture(),before=r.photo.data.slice(),out=stage.samplePreparedReferencePhoto(r),A=768*768;
 assert.deepEqual([out.width,out.height,out.layout,out.format],[768,768,'CHW',301]);assert.equal(out.validFootprintPixels,4);
 assert.deepEqual(Array.from(new Uint32Array(out.samplingInverse.buffer)),[0x3f000000,0x80000000,0,0x80000000,0x3f000000,0]);
 assert.deepEqual([out.data[0],out.data[A],out.data[2*A]],[0,10,20]);
 assert.deepEqual([out.data[1],out.data[A+1],out.data[2*A+1]],[50,60,70]);
 assert.deepEqual([out.data[769],out.data[A+769],out.data[2*A+769]],[138.75,146,153.25]);
 assert.deepEqual([out.data[2],out.data[770],out.data[A+2],out.data[2*A+2]],[0,0,0,0]);
 assert.deepEqual(r.photo.data,before);out.data.fill(1);assert.deepEqual(r.photo.data,before);
});
test('工作forward带平移时quarter坐标正确，错误来源或几何不变',()=>{
 assert.equal(typeof stage?.samplePreparedReferencePhoto,'function','current reference photo stage is missing');
 const r=fixture();r.geometry.inputForward=Float32Array.from([2,0,-.5,0,2,-.5]);
 const out=stage.samplePreparedReferencePhoto(r);assert.equal(out.data[0],72.1875);assert.equal(out.data[1],116.5625);assert.equal(out.validFootprintPixels,4);
 const before=r.photo.data.slice();
 for(const patch of [{photo:{...r.photo,format:300}},{photo:{...r.photo,width:1}},{photo:{...r.photo,stride:5}},{photo:{...r.photo,data:new Uint8Array(17)}},{geometry:{...r.geometry,valid:false}},{geometry:{...r.geometry,inputForward:Float32Array.from([Infinity,0,0,0,1,0])}}]){
  assert.throws(()=>stage.samplePreparedReferencePhoto({...r,...patch}));assert.deepEqual(r.photo.data,before);
 }
});
