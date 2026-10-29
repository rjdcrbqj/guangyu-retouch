const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
const {createPreparedToothRepairProcessor:create}=require('../inference/tooth-repair/pipeline.cjs');
function input(infer){const landmarks=new Float32Array(214);for(let i=0;i<12;i++){const a=i*Math.PI/6;landmarks.set([8+4*Math.cos(a),8+2*Math.sin(a)],(95+i)*2);}return {image:new Uint8Array(20*16*3),width:20,height:16,rect:[2,3,12,10],landmarks,infer};}
const prediction=(value=255)=>({image:{data:new Float32Array(512*512*3).fill(value),dims:[1,3,512,512]},alpha:{data:new Float32Array(512*512).fill(1),dims:[1,1,512,512]}});
test('牙齿缓存：相同输入复用，区域外、保护蒙版和合成分支仍取本次值',async()=>{
 assert.equal(typeof create,'function');await initializeOpenCV();const worker=create();let calls=0;const source=input(async()=>{calls++;return prediction();}),first=await worker.process(source);assert.equal(calls,1);assert.deepEqual(await worker.process(source),first);
 const outside={...source,image:source.image.slice()};outside.image[0]=77;assert.equal((await worker.process(outside))[0],77);assert.equal(calls,1);
 const protectedOut=await worker.process({...source,mask:{data:new Uint8Array([0]),width:1,height:1}});assert.deepEqual(protectedOut,source.image);assert.equal(calls,1);
 const vector=await worker.process({...source,branch:'sse41'});assert.notDeepEqual(vector,first);assert.equal(calls,1);
});
test('牙齿缓存：模型输入、辅助关键点、供应器和主动刷新均使缓存失效',async()=>{
 assert.equal(typeof create,'function');await initializeOpenCV();const worker=create();let calls=0;const infer=async()=>{calls++;return prediction();},source=input(infer);await worker.process(source);
 source.image[3*60+2*3]=80;await worker.process(source);assert.equal(calls,2);source.landmarks[95*2]+=1;await worker.process(source);assert.equal(calls,3);await worker.process({...source,dirty:true});assert.equal(calls,4);worker.invalidate();await worker.process(source);assert.equal(calls,5);await worker.process({...source,infer:async value=>infer(value)});assert.equal(calls,6);
});
test('牙齿缓存：保存张量副本，供应器后续改写不会污染缓存',async()=>{
 assert.equal(typeof create,'function');await initializeOpenCV();const worker=create(),tensor=prediction();let calls=0;const source=input(async()=>{calls++;return tensor;}),first=await worker.process(source);tensor.image.data.fill(0);tensor.alpha.data.fill(0);assert.deepEqual(await worker.process(source),first);assert.equal(calls,1);assert.deepEqual(await worker.process({...source,dirty:true}),source.image);assert.equal(calls,2);
});
test('牙齿缓存：失败和错误张量不保留旧结果，之后允许重试',async()=>{
 assert.equal(typeof create,'function');await initializeOpenCV();const worker=create(),failed=new Error('供应器失败');let mode='ok',calls=0;const source=input(async()=>{calls++;if(mode==='error')throw failed;if(mode==='bad')return {image:{data:new Float32Array(3),dims:[1,3,1,1]},alpha:{data:new Float32Array(1),dims:[1,1,1,1]}};return prediction();});await worker.process(source);mode='error';await assert.rejects(worker.process({...source,dirty:true}),e=>e===failed);mode='bad';await assert.rejects(worker.process(source),RangeError);mode='ok';await worker.process(source);await worker.process(source);assert.equal(calls,4);
});
test('牙齿缓存：并发相同输入只请求一次，较早结果不能覆盖较新输入',async()=>{
 assert.equal(typeof create,'function');await initializeOpenCV();const worker=create(),pending=[];let calls=0;const source=input(()=>{calls++;return new Promise(resolve=>pending.push(resolve));});const a=worker.process(source),b=worker.process(source);assert.equal(calls,1);pending.shift()(prediction());assert.deepEqual(await a,await b);assert.equal(calls,1);
 worker.invalidate();const old=worker.process(source),changed={...source,image:source.image.slice()};changed.image[3*60+2*3]=77;const recent=worker.process(changed);assert.equal(calls,3);const oldResolve=pending.shift(),newResolve=pending.shift();newResolve(prediction(201));const latest=await recent;oldResolve(prediction(101));await old;assert.deepEqual(await worker.process(changed),latest);assert.equal(calls,3);
});
test('牙齿缓存：等待中的结果在主动失效后不得重新填入缓存',async()=>{
 assert.equal(typeof create,'function');await initializeOpenCV();const worker=create();let resolve,calls=0;const source=input(()=>{calls++;return calls===1?new Promise(r=>{resolve=r;}):prediction();});const pending=worker.process(source);worker.invalidate();resolve(prediction());await pending;await worker.process(source);assert.equal(calls,2);
});
