import test from 'node:test';
import assert from 'node:assert/strict';
import {syncParams} from '../src/workflow.js';
test('只同步已调整参数，保留目标照片其它调整；全部模式允许归零',()=>{
 const target={exposure:1,contrast:20,saturation:15},source={exposure:.25,contrast:0};
 const changed=syncParams(target,source,['basic'],{changedOnly:true});
 assert.equal(changed.exposure,.25);assert.equal(changed.contrast,20);assert.equal(changed.saturation,15);
 const all=syncParams(target,source,['basic']);assert.equal(all.contrast,0);assert.equal(all.saturation,0);
});
test('非零默认值不算调整，分组之外不覆盖',()=>{
 const result=syncParams({sharpRadius:5,skinSmooth:30},{exposure:.25,sharpRadius:2,skinSmooth:60},['basic'],{changedOnly:true});
 assert.equal(result.sharpRadius,5);assert.equal(result.skinSmooth,30);
});
