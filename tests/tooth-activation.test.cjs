const test=require('node:test'),assert=require('node:assert/strict');
const {isPreparedToothRepairEnabled:enabled}=require('../inference/tooth-repair/eligibility.cjs');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs'),{processPreparedToothRepair:process,createPreparedToothRepairProcessor:create}=require('../inference/tooth-repair/pipeline.cjs');
test('牙齿启用：先取float32，再严格大于原0.001阈值',()=>{
 assert.equal(typeof enabled,'function');const threshold=Math.fround(.001),bits=new Uint32Array(Float32Array.of(threshold).buffer);bits[0]++;const above=new Float32Array(bits.buffer)[0];for(const value of [-1,-0,0,.001,threshold,threshold+1e-11])assert.equal(enabled(value),false);assert.equal(enabled(above),true);assert.equal(enabled(.5),true);for(const value of [NaN,Infinity,'1',undefined])assert.throws(()=>enabled(value),RangeError);
});
test('牙齿禁用：资格旁路不能重新启用，也不准备关键点或调用模型',async()=>{
 const image=new Uint8Array(12*12*3).fill(41);let calls=0;const result=await process({image,width:12,height:12,rect:[0,0,12,12],controlValue:0,eligibility:{bypass:true},infer:()=>{calls++;throw Error('禁用不应推理');}});assert.deepEqual(result,image);assert.notEqual(result,image);assert.equal(calls,0);
});
test('牙齿控制值：启用后不缩放修复强度，关开切换仍可复用相同模型结果',async()=>{
 await initializeOpenCV();const worker=create(),image=new Uint8Array(12*12*3),landmarks=new Float32Array(284).fill(6);let calls=0;const input={image,width:12,height:12,rect:[0,0,12,12],landmarks,infer:async()=>{calls++;return {image:{data:new Float32Array(512*512*3).fill(200),dims:[1,3,512,512]},alpha:{data:new Float32Array(512*512).fill(1),dims:[1,1,512,512]}};}};
 const full=await worker.process(input);assert.equal(full[0],200);assert.deepEqual(await worker.process({...input,controlValue:.5}),full);assert.deepEqual(await worker.process({...input,controlValue:0}),image);assert.deepEqual(await worker.process({...input,controlValue:1}),full);assert.equal(calls,1);
});
