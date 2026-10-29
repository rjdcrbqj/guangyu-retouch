const test=require('node:test'),assert=require('node:assert/strict');
const {buildPreparedToothPersonPlan:build}=require('../inference/tooth-repair/person-plan.cjs');
const pipeline=require('../inference/tooth-repair/pipeline.cjs');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
function input(){return {image:new Uint8Array(12*12*3).fill(17),width:12,height:12,rect:[0,0,12,12],landmarks:new Float32Array(284).fill(6)};}
test('牙齿人物计划串联：旁路位不能重新启用关闭人物，也不会生成输入张量',async()=>{
 assert.equal(typeof pipeline.processPlannedToothRepair,'function');const plan=build({personKeys:[8],reuseBypassAllowed:true,savedBypass:{bitCount:1,words:Uint32Array.of(1)}}),data=input();data.landmarks=null;
 const out=await pipeline.processPlannedToothRepair({plan,personIndex:0,input:{...data,controlValue:1,eligibility:{bypass:true},infer:()=>{throw Error('关闭人物不应进入模型');}}});assert.deepEqual(out,data.image);assert.notEqual(out,data.image);
});
test('牙齿人物计划串联：仅数量匹配的开启人物跳过资格筛选，调用方旧旁路不会覆盖计划',async()=>{
 await initializeOpenCV();const data=input(),stop=new Error('已到模型入口');let calls=0;
 for(const bitCount of [1,2]){const plan=build({personKeys:[8],controlsByKey:new Map([[8,1]]),reuseBypassAllowed:true,savedBypass:{bitCount,words:Uint32Array.of(1)}});
  const promise=pipeline.processPlannedToothRepair({plan,personIndex:0,input:{...data,controlValue:0,eligibility:{bypass:true},infer:()=>{calls++;throw stop;}}});
  if(bitCount===1)await assert.rejects(promise,e=>e===stop);else assert.deepEqual(await promise,data.image);
 }assert.equal(calls,1);
});
test('牙齿人物计划串联：成功合成且保留源图，传给模型的仍是已确认输入格式',async()=>{
 await initializeOpenCV();const data=input(),plan=build({personKeys:[71],controlsByKey:new Map([[71,.1]]),reuseBypassAllowed:true,savedBypass:{bitCount:1,words:Uint32Array.of(1)}});
 const out=await pipeline.processPlannedToothRepair({plan,personIndex:0,input:{...data,infer:async tensors=>{assert.deepEqual(tensors.image.dims,[1,3,512,512]);return {image:{data:new Float32Array(512*512*3).fill(200),dims:[1,3,512,512]},alpha:{data:new Float32Array(512*512).fill(1),dims:[1,1,512,512]}};}}});
 assert(out.every(v=>v===200));assert(data.image.every(v=>v===17));
});
test('牙齿人物计划串联：截断之外的人物与伪造计划都明确拒绝',async()=>{
 const plan=build({personKeys:Array.from({length:20},(_,i)=>i),limitFlagByte:1});
 for(const options of [{plan,personIndex:15},{plan,personIndex:-1},{plan:{people:[]},personIndex:0}])await assert.rejects(pipeline.processPlannedToothRepair({...options,input:input()}),RangeError);
});
test('牙齿人物计划串联：不吞掉原资格对象的格式错误',async()=>{
 const plan=build({personKeys:[1]});for(const eligibility of [null,true,[]])await assert.rejects(pipeline.processPlannedToothRepair({plan,personIndex:0,input:{...input(),eligibility,infer:()=>{throw Error('不应调用');}}}),RangeError);
});
