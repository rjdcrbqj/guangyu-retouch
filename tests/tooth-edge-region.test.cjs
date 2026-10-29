const test=require('node:test'),assert=require('node:assert/strict');
const geometry=require('../inference/tooth-repair/geometry.cjs'),{initializeOpenCV}=require('../inference/opencv-runtime.cjs'),{processPreparedToothRepair:process}=require('../inference/tooth-repair/pipeline.cjs');
function setup(){const landmarks=new Float32Array(284).fill(5);landmarks.set([0,0],0);landmarks.set([25,25],2);landmarks.set([5,5],196);landmarks.set([5,5.5],208);return {image:new Uint8Array(40*40*3),width:40,height:40,landmarks,eligibility:{minimumOpening:20,minimumRegionSize:0,checkQuality:false}};}
function prediction(){return {image:{data:new Float32Array(512*512*3).fill(200),dims:[1,3,512,512]},alpha:{data:new Float32Array(512*512).fill(1),dims:[1,1,512,512]}};}
test('牙齿边缘区域：资格判断取真实交集，模型区域保留移动后的宽高',()=>{
 assert.equal(typeof geometry.intersectPreparedToothRect,'function');const input={rect:[-5,-7,20,25],width:100,height:80};assert.deepEqual(geometry.intersectPreparedToothRect(input),[0,0,15,18]);assert.deepEqual(geometry.clipPreparedToothRect(input),[0,0,20,25]);assert.deepEqual(geometry.intersectPreparedToothRect({...input,rect:[-50,0,20,25]}),[0,0,0,0]);
});
test('牙齿边缘资格：张口距离使用交集宽度，不能沿用模型区域宽度',async()=>{
 await initializeOpenCV();const input=setup();let calls=0;input.infer=async()=>{calls++;return prediction();};const skipped=await process({...input,rect:[0,0,20,20]});assert.equal(calls,0);assert.deepEqual(skipped,input.image);const repaired=await process({...input,rawRect:[-10,0,20,20]});assert.equal(calls,1);assert.equal(repaired[0],200);await assert.rejects(process({...input,rect:[0,0,20,20],rawRect:[-10,0,20,20]}),RangeError);
});
test('牙齿边缘旁路：空交集默认跳过，明确旁路才使用模型区域',async()=>{
 await initializeOpenCV();const input=setup();let calls=0;input.infer=async()=>{calls++;return prediction();};assert.deepEqual(await process({...input,rawRect:[-50,2,20,20]}),input.image);assert.equal(calls,0);const out=await process({...input,rawRect:[-50,2,20,20],eligibility:{bypass:true}});assert.equal(calls,1);assert.equal(out[2*40*3],200);
});
