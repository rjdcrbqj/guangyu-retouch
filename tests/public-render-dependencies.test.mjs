import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
// 模拟干净发行版：未经核实的旧纹理、查找表及暗角资源均不可加载。
test('运行引擎和旧参数在不提供恢复的渲染资源时仍可加载',()=>{
 const code=`import {registerHooks} from 'node:module';registerHooks({resolve(name,context,next){if(/recovered-(native-teeth|native-color|bright-eye|vignette|adjustments|color|finishing|sharpen)\\.js$/.test(name))throw Error('不可分发资源：'+name);return next(name,context);}});await import('./src/engine.js');await import('./src/bulk-params.js');`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
