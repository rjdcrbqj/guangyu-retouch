const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
const {processPreparedToothRepair:process}=require('../inference/tooth-repair/pipeline.cjs');
function setup(){const landmarks=new Float32Array(214);for(let i=0;i<landmarks.length;i+=2)landmarks.set([300,300],i);landmarks.set([100,100],0);landmarks.set([500,500],2);landmarks.set([300,330],208);return {image:new Uint8Array(640*640*3).fill(127),width:640,height:640,rect:[64,64,512,512],landmarks,eligibility:{}};}
test('牙齿资格串联：默认规则在低清晰度时跳过推理并保留原图',async()=>{
 await initializeOpenCV();const input=setup();let calls=0;input.infer=async()=>{calls++;throw new Error('不应运行');};const out=await process(input);assert.equal(calls,0);assert.deepEqual(out,input.image);assert.notEqual(out,input.image);
});
test('牙齿资格串联：闭嘴与检查区域过小都不会调用模型',async()=>{
 await initializeOpenCV();for(const kind of ['closed','small']){const input=setup();input.eligibility.checkQuality=false;if(kind==='closed')input.landmarks[209]=310;else {input.landmarks.set([280,280],0);input.landmarks.set([360,360],2);}input.infer=()=>{throw new Error('不应运行');};assert.deepEqual(await process(input),input.image);}
});
test('牙齿资格串联：关闭清晰度检查或设置旁路位可继续已准备流程',async()=>{
 await initializeOpenCV();for(const bypass of [false,true]){const input=setup(),stop=new Error('模型入口已到达');input.eligibility=bypass?{bypass:true}:{checkQuality:false};if(bypass)input.landmarks.fill(300);let calls=0;input.infer=()=>{calls++;throw stop;};await assert.rejects(process(input),error=>error===stop);assert.equal(calls,1);}
});
test('牙齿资格串联：拒绝无效规则对象和开关',async()=>{
 await initializeOpenCV();for(const eligibility of [null,true,{checkQuality:'yes'},{bypass:'yes'}])await assert.rejects(process({...setup(),eligibility,infer:()=>{throw new Error('不应运行');}}),RangeError);
});
