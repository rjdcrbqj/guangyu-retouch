import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreset,validatePreset,serializePreset} from '../src/workflow.js';
import {alignEffectParams} from '../src/ai-effect-stack.js';
test('新预设保存所选分组的 AI 配方，不携带图像；旧预设仍有效',()=>{
 const stages=[{kind:'eye-bag',options:{primaryPercent:40,secondaryPercent:0}},{kind:'skin-unify',options:{strengthPercent:50}}];
 const preset=createPreset('眼袋',{},['eyes'],{effects:stages});
 assert.deepEqual(validatePreset(serializePreset(preset)).effects,[stages[0]]);assert.equal(serializePreset(preset).includes('data:image'),false);
 const old=createPreset('旧参数',{},['eyes']);assert.equal(validatePreset(serializePreset(old)).effects,undefined);
});
test('预设拒绝跨分组 AI 配方，完整复制默认次级控制值',()=>{
 const preset=createPreset('测试',{},['eyes']);assert.throws(()=>validatePreset({...preset,effects:[{kind:'skin-unify',options:{strengthPercent:50}}]}),/分组/);
 assert.deepEqual(alignEffectParams({eyeBagStrength:1,eyeBagKeep:30},[{kind:'eye-bag',options:{primaryPercent:40,secondaryPercent:0}}],['eyes']),{eyeBagStrength:40,eyeBagKeep:0});
});
