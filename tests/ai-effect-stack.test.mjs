import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceEffect,normalizeEffectState,renderEffectStack,syncEffectStages} from '../src/ai-effect-stack.js';
const source='data:image/png;base64,AA==';
const stage=(kind,strengthPercent)=>({kind,options:{strengthPercent}});
const png=value=>'data:image/png;base64,'+Buffer.from(String(value)).toString('base64');
test('同一效果更新原位置，零强度移除，不修改已有配方',()=>{
 const first=[stage('dark-circles',20),stage('lip-wrinkle',30)];
 const next=replaceEffect(first,stage('dark-circles',60));
 assert.deepEqual(next,[stage('dark-circles',60),stage('lip-wrinkle',30)]);assert.equal(first[0].options.strengthPercent,20);
 assert.deepEqual(replaceEffect(next,stage('dark-circles',0)),[stage('lip-wrinkle',30)]);
});
test('调整同一个效果从原图重新计算；上游变化会重算下游，不叠加旧结果',async()=>{
 const calls=[];const run=async(kind,input,options)=>{calls.push({kind,input,options});return {png:Buffer.from(input+options.strengthPercent).toString('base64'),processedFaces:1,detectedFaces:1};};
 const initial=[stage('dark-circles',20),stage('lip-wrinkle',30)];const a=await renderEffectStack({source,stages:initial,run});
 calls.length=0;const b=await renderEffectStack({source,stages:replaceEffect(initial,stage('dark-circles',60)),run,cache:a.cache});
 assert.equal(calls.length,2);assert.equal(calls[0].input,source);assert.notEqual(calls[0].input,a.image);
 calls.length=0;await renderEffectStack({source,stages:replaceEffect(b.stages,stage('lip-wrinkle',70)),run,cache:b.cache});assert.equal(calls.length,1);assert.equal(calls[0].kind,'lip-wrinkle');
});
test('无脸输出与失败均不污染原缓存；空配方恢复原图',async()=>{
 const run=async()=>({png:'AQ==',processedFaces:0,detectedFaces:0});
 const result=await renderEffectStack({source,stages:[stage('dark-circles',20)],run});assert.equal(result.image,source);
 const saved=structuredClone(result.cache);
 await assert.rejects(renderEffectStack({source,stages:[stage('dark-circles',50)],cache:result.cache,run:async()=>{throw Error('inference failed');}}),/inference/);
 assert.deepEqual(result.cache,saved);
 assert.equal((await renderEffectStack({source,stages:[],run:()=>assert.fail()})).image,source);
});
test('工程仅接受嵌入图像与已知有限范围的效果设置',()=>{
 const valid={version:1,stages:[stage('skin-unify',40)],image:png(1)};assert.deepEqual(normalizeEffectState(valid),valid);
 for(const bad of [{...valid,image:'file:///x.png'},{...valid,stages:[stage('unknown',1)]},{...valid,stages:[stage('skin-unify',101)]},{...valid,stages:[...valid.stages,...valid.stages]}])assert.throws(()=>normalizeEffectState(bad),/效果/);
});
test('同步按分组复制实际应用配方；仅已调整不清除目标其它效果',()=>{
 const target=[stage('dark-circles',10),stage('lip-wrinkle',40)],sourceStages=[stage('skin-unify',80)];
 assert.deepEqual(syncEffectStages(target,sourceStages,['unify'],{changedOnly:true}),[...target,...sourceStages]);
 assert.deepEqual(syncEffectStages(target,[],['eyes'],{changedOnly:false}),[stage('lip-wrinkle',40)]);
 assert.deepEqual(syncEffectStages(target,[],['eyes'],{changedOnly:true}),target);
});
test('同步和预设沿用源效果的处理顺序，避免同数值产生不同组合结果',()=>{
 const sourceStages=[stage('lip-wrinkle',30),stage('dark-circles',60)];
 assert.deepEqual(syncEffectStages([],sourceStages,['eyes','lip']),sourceStages);
 assert.deepEqual(syncEffectStages([stage('dark-circles',10),stage('lip-wrinkle',20)],sourceStages,['eyes','lip']),sourceStages);
});
