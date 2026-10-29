const test=require('node:test'),assert=require('node:assert/strict');
let geometry;try{geometry=require('../inference/tooth-repair/geometry.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const {choosePreparedToothQualityRect:quality}=require('../inference/tooth-repair/eligibility.cjs');
test('牙齿关键点：原模板142点上限、忽略未选中尾部并持有副本',()=>{
 assert.ok(geometry);const source=Float32Array.from({length:388},(_,i)=>i<284?i/3:NaN),selected=geometry.selectPreparedToothLandmarks(source);assert.equal(selected.length,284);assert.deepEqual(selected,source.subarray(0,284));source[0]=99;assert.equal(selected[0],0);assert.equal(geometry.selectPreparedToothLandmarks(new Float32Array(214)).length,214);
});
test('牙齿质量区域：第143点起的辅助点不能扩大检查区域',()=>{
 const selected=Float32Array.from({length:284},(_,i)=>i%2?80+Math.floor(i/2/10)*3:100+(Math.floor(i/2)%10)*2),extended=new Float32Array(388);extended.set(selected);extended.fill(1e7,284);assert.deepEqual(quality({landmarks:extended,width:640,height:480}),[97,59,22,63]);extended.fill(NaN,284);assert.deepEqual(quality({landmarks:extended,width:640,height:480}),[97,59,22,63]);
});
test('牙齿整数区域：先限制原点再限制宽高，负原点不按普通交集缩减尺寸',()=>{
 assert.ok(geometry);const clip=rect=>geometry.clipPreparedToothRect({rect,width:100,height:80});for(const [input,expected] of [[[-5,-7,20,25],[0,0,20,25]],[[90,70,20,25],[90,70,10,10]],[[101,81,20,25],[100,80,0,0]],[[-5,77,200,20],[0,77,100,3]],[[10,20,-1,-3],[10,20,0,0]],[[0,0,100,80],[0,0,100,80]]])assert.deepEqual(clip(input),expected);
});
test('牙齿对齐：独立float32位对照，横纵都使用区域宽度',()=>{
 assert.ok(geometry);for(const row of require('./fixtures/tooth-geometry-static.json').cases){const out=geometry.alignPreparedToothLandmarks({rect:row.rect,landmarks:new Float32Array(row.landmarks)});assert.deepEqual(Array.from(new Uint32Array(out.buffer,out.byteOffset,out.length)),row.expectedBits);}
});
test('牙齿几何：拒绝无效已选点、奇数点列和无效整数范围',()=>{
 assert.ok(geometry);for(const source of [new Float32Array(),new Float32Array(3),new Float32Array([NaN,0])])assert.throws(()=>geometry.selectPreparedToothLandmarks(source),RangeError);assert.throws(()=>geometry.clipPreparedToothRect({rect:[.5,0,10,10],width:30,height:30}),RangeError);assert.throws(()=>geometry.alignPreparedToothLandmarks({rect:[0,0,0,10],landmarks:new Float32Array([0,0])}),RangeError);
});
test('牙齿串联：194点输入的未选尾部不进入资格或模型准备',async()=>{
 const {initializeOpenCV}=require('../inference/opencv-runtime.cjs'),{processPreparedToothRepair}=require('../inference/tooth-repair/pipeline.cjs');await initializeOpenCV();const landmarks=new Float32Array(388).fill(NaN);landmarks.fill(10,0,284);const image=new Uint8Array(20*20*3).fill(17);let calls=0;const output=await processPreparedToothRepair({image,width:20,height:20,rect:[0,0,20,20],landmarks,eligibility:{checkQuality:false,minimumOpening:0,minimumRegionSize:0},infer:async()=>{calls++;return {image:{data:new Float32Array(512*512*3),dims:[1,3,512,512]},alpha:{data:new Float32Array(512*512),dims:[1,1,512,512]}};}});assert.equal(calls,1);assert.deepEqual(output,image);
});
