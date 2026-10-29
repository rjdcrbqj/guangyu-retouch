'use strict';
const {isPreparedToothRepairEnabled}=require('./eligibility.cjs');
const plans=new WeakSet();

// 147cdf4e0：按人物列表顺序查整数键对应的控制值，缺失值为0。
// 条件标志字节恰为1时调用142ec6fc0复制闭区间[0,14]，因此上限为15人。
// 141e90e00的业务含义尚未确认，由调用方提供reuseBypassAllowed；不绑定界面模式。
// 1434e1c00 ->147fea650只在位数匹配时复制旁路位，仍按列表位置，不按人物键重排。
function buildPreparedToothPersonPlan({personKeys,controlsByKey=new Map(),limitFlagByte=0,reuseBypassAllowed=false,savedBypass}={}){
 if(!Array.isArray(personKeys)&&!(personKeys instanceof Int32Array)||!(controlsByKey instanceof Map)||!Number.isInteger(limitFlagByte)||limitFlagByte<0||limitFlagByte>255||typeof reuseBypassAllowed!=='boolean')throw new RangeError('牙齿人物列表、控制值映射或状态标志无效');
 if(savedBypass!==undefined&&(!savedBypass||!Number.isSafeInteger(savedBypass.bitCount)||savedBypass.bitCount<0||!(savedBypass.words instanceof Uint32Array)||Math.ceil(savedBypass.bitCount/32)>savedBypass.words.length))throw new RangeError('牙齿资格旁路位图无效');
 const count=limitFlagByte===1?Math.min(personKeys.length,15):personKeys.length;
 const useSaved=reuseBypassAllowed&&savedBypass!==undefined&&savedBypass.bitCount===count;
 const enabledWords=new Uint32Array(Math.ceil(count/32)),bypassWords=new Uint32Array(useSaved?Math.ceil(count/32):0),people=[];
 for(let index=0;index<count;index++){
  const key=personKeys[index];if(!Number.isInteger(key)||key<-2147483648||key>2147483647)throw new RangeError('牙齿人物键必须为32位整数');
  const enabled=isPreparedToothRepairEnabled(controlsByKey.has(key)?controlsByKey.get(key):0);
  const bypassQuality=useSaved&&((savedBypass.words[index>>>5]>>>(index&31))&1)!==0;
  if(enabled)enabledWords[index>>>5]|=1<<(index&31);
  if(bypassQuality)bypassWords[index>>>5]|=1<<(index&31);
  people.push(Object.freeze({index,key,enabled,bypassQuality}));
 }
 // 位图是独立副本，尾部未使用位归零；执行入口消费冻结的人物记录。
 const plan=Object.freeze({people:Object.freeze(people),enabledWords,bypassWords,bypassBitCount:useSaved?count:0});plans.add(plan);return plan;
}

// 只能使用本模块准备的快照，避免异步流程读到外部改写的人物状态。
function preparedToothPersonAt(plan,index){
 if(!plans.has(plan)||!Number.isInteger(index)||index<0||index>=plan.people.length)throw new RangeError('牙齿人物计划或列表位置无效');
 return plan.people[index];
}
module.exports={buildPreparedToothPersonPlan,preparedToothPersonAt};
