const test=require('node:test'),assert=require('node:assert/strict');
const {buildPreparedToothPersonPlan:build}=require('../inference/tooth-repair/person-plan.cjs');
test('牙齿人物计划：按人物键查控制值，缺失为关闭，原顺序与重复键均保留',()=>{
 const plan=build({personKeys:[71,4,71,99],controlsByKey:new Map([[4,.001],[71,.25]])});
 assert.deepEqual(plan.people.map(p=>[p.index,p.key,p.enabled,p.bypassQuality]),[[0,71,true,false],[1,4,false,false],[2,71,true,false],[3,99,false,false]]);
 assert.deepEqual([...plan.enabledWords],[5]);assert.equal(plan.bypassBitCount,0);
});
test('牙齿人物截断：标志恰为1才保留索引0至14，共15人，不先筛掉关闭人物',()=>{
 const personKeys=Array.from({length:17},(_,i)=>100+i),controlsByKey=new Map([[114,1],[115,1]]);
 for(const count of [0,14,15,16,17])for(const limitFlagByte of [0,1,2,255]){
  const plan=build({personKeys:personKeys.slice(0,count),controlsByKey,limitFlagByte});
  assert.equal(plan.people.length,limitFlagByte===1?Math.min(count,15):count);
  if(plan.people.length>=15)assert.equal(plan.people[14].enabled,true);
 }
});
test('牙齿人物旁路：复用开关与截断后的总人数都匹配才复用，关闭人物也计入',()=>{
 const personKeys=Array.from({length:16},(_,i)=>i),controlsByKey=new Map([[14,1]]);
 for(const reuseBypassAllowed of [false,true])for(const bitCount of [14,15,16]){
  const plan=build({personKeys,controlsByKey,limitFlagByte:1,reuseBypassAllowed,savedBypass:{bitCount,words:Uint32Array.of(0x7fff)}}),accepted=reuseBypassAllowed&&bitCount===15;
  assert.equal(plan.bypassBitCount,accepted?15:0);assert.equal(plan.people[14].bypassQuality,accepted);
  assert.equal(plan.people[0].enabled,false);assert.equal(plan.people[0].bypassQuality,accepted);
 }
});
test('牙齿人物位图：跨32位边界仍按列表位置读取，副本不受调用方修改影响',()=>{
 const personKeys=Array.from({length:65},(_,i)=>i+900),controlsByKey=new Map(personKeys.map((key,i)=>[key,[0,31,32,63,64].includes(i)?1:0]));
 const words=Uint32Array.of(0x80000001,0x80000001,0xffffffff),plan=build({personKeys,controlsByKey,reuseBypassAllowed:true,savedBypass:{bitCount:65,words}});
 assert.deepEqual([...plan.enabledWords],[0x80000001,0x80000001,1]);
 assert.deepEqual(plan.people.filter(p=>p.bypassQuality).map(p=>p.index),[0,31,32,63,64]);
 words.fill(0);personKeys[0]=123;controlsByKey.clear();assert.equal(plan.people[0].key,900);assert.equal(plan.people[64].bypassQuality,true);assert.equal(plan.bypassWords[2],1);
});
test('牙齿人物控制阈值沿用float32严格大于0.001，非法数据明确拒绝',()=>{
 const threshold=Math.fround(.001),bits=new Uint32Array(Float32Array.of(threshold).buffer);bits[0]++;const above=new Float32Array(bits.buffer)[0];
 assert.deepEqual(build({personKeys:[1,2,3],controlsByKey:new Map([[1,threshold+1e-11],[2,above],[3,-1]])}).people.map(p=>p.enabled),[false,true,false]);
 for(const input of [{personKeys:[1.5]},{personKeys:[1],controlsByKey:{}},{personKeys:[1],controlsByKey:new Map([[1,NaN]])},{personKeys:[1],limitFlagByte:256},{personKeys:[1],reuseBypassAllowed:1},{personKeys:[1],savedBypass:{bitCount:33,words:Uint32Array.of(1)}}])assert.throws(()=>build(input),RangeError);
});
test('牙齿人物旁路保留位置语义，人物键重排只改变启用值，不擅自重排旁路',()=>{
 const plan=build({personKeys:[9,2],controlsByKey:new Map([[2,1]]),reuseBypassAllowed:true,savedBypass:{bitCount:2,words:Uint32Array.of(1)}});
 assert.deepEqual(plan.people.map(p=>[p.key,p.enabled,p.bypassQuality]),[[9,false,true],[2,true,false]]);
});
