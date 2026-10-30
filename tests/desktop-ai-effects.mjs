// 流程测试注入确定的服务输出，验证状态和像素连线；不作为模型效果一致性的证据。
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),packaged=process.argv.includes('--packaged'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await pw._electron.launch({executablePath:path.join(root,packaged?'dist/payload/光屿修图.exe':'runtime/electron.exe'),args:[...(packaged?[]:[root]),'--user-data-dir='+path.join(root,'dist/ai-workflow-test-profile')],env});
try{
 const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.locator('#hand.active').waitFor();
 const frames=await page.evaluate(()=>{const result={};for(const [key,color] of Object.entries({original:'#205030',40:'#903020',60:'#c03020',90:'#444444',lip:'#2030c0'})){const c=document.createElement('canvas');c.width=key==='90'?32:600;c.height=key==='90'?32:400;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,600,400);result[key]=c.toDataURL();}return result;});
 await app.evaluate(({ipcMain},frames)=>{
  globalThis.aiCalls=[];globalThis.aiSaved=null;globalThis.aiFailAt=0;
  for(const kind of ['dark-circles','lip-wrinkle']){ipcMain.removeHandler(kind+'-repair');ipcMain.handle(kind+'-repair',(_event,p)=>{globalThis.aiCalls.push({kind,...p});if(p.strengthPercent===80||globalThis.aiCalls.length===globalThis.aiFailAt)throw Error('test inference failure');return {png:frames[kind==='lip-wrinkle'?'lip':p.strengthPercent].split(',')[1],processedFaces:1,detectedFaces:1};});}
  ipcMain.removeHandler('save-file');ipcMain.handle('save-file',(_event,p)=>{globalThis.aiSaved=p;return {canceled:false};});
 },frames);
 await page.locator('#files').setInputFiles([1,2,3].map(i=>({name:`effect-${i}.png`,mimeType:'image/png',buffer:Buffer.from(frames.original.split(',')[1],'base64')})));
 await page.waitForFunction(()=>document.querySelector('#photo-count').textContent==='3 张'&&!document.querySelector('#import').disabled);
 const set=async(id,value)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);await page.waitForFunction(()=>!document.querySelector('#import').disabled);};
 const pixel=()=>page.evaluate(()=>{const c=document.querySelector('#preview'),gl=c.getContext('webgl'),a=new Uint8Array(4),b=new Uint8Array(4);gl.readPixels(c.width/4,c.height/2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.readPixels(3*c.width/4,c.height/2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);return [Array.from(a),Array.from(b)];});
 const save=async()=>{await page.locator('#save-project').click();await page.waitForFunction(()=>!document.querySelector('#save-project').disabled);return JSON.parse(await app.evaluate(()=>globalThis.aiSaved.data));};
 await set('darkCirclesStrength',40);assert.equal((await app.evaluate(()=>globalThis.aiCalls)).length,1,'松开滑杆应直接应用当前照片');assert.equal(await page.locator('#photo-count').textContent(),'3 张');assert((await pixel())[0][0]>100);
 await set('darkCirclesStrength',60);const calls=await app.evaluate(()=>globalThis.aiCalls);assert.equal(calls[1].original,frames.original);assert((await pixel())[0][0]>170);
 await page.locator('#compare').click();const compared=await pixel();assert(compared[0][1]>compared[0][0]);assert(compared[1][0]>compared[1][1]);await page.locator('#compare').click();
 await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelector('#darkCirclesStrength').value==='40'&&!document.querySelector('#import').disabled);assert((await pixel())[0][0]<170);
 await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>document.querySelector('#darkCirclesStrength').value==='60'&&!document.querySelector('#import').disabled);
 await set('darkCirclesStrength',80);assert.equal(await page.locator('#darkCirclesStrength').inputValue(),'60');assert((await pixel())[0][0]>170);
 await set('lipWrinkleStrength',30);const combined=await save();assert.equal(combined.photos[0].original,frames.original);assert.equal(combined.photos[0].effects.stages.length,2);assert((await pixel())[0][2]>170);
 await set('lipWrinkleStrength',0);assert((await pixel())[0][0]>170);assert.equal((await save()).photos[0].effects.stages.length,1);
 await page.locator('#mark-all').click();await page.locator('[data-sync-group="basic"]').uncheck();await page.locator('[data-sync-group="eyes"]').check();await page.locator('#sync-params').click();await page.waitForFunction(()=>!document.querySelector('#import').disabled);const synced=await save();assert.equal(synced.photos[1].effects.stages[0].kind,'dark-circles');
 await page.locator('.photo-item[data-index="1"]').click();assert((await pixel())[0][0]>170);await page.keyboard.press('Control+Alt+z');await page.waitForFunction(()=>document.querySelector('#file-name').textContent==='effect-1.png');await page.keyboard.press('Control+Alt+z');await page.waitForFunction(()=>!document.querySelector('#import').disabled);assert.equal((await save()).photos[1].effects,undefined);
 const saved=await save();await page.locator('#project-file').setInputFiles({name:'effects.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已恢复'));assert((await pixel())[0][0]>170);
 await page.locator('#reset').click();await page.waitForFunction(()=>!document.querySelector('#import').disabled);assert((await pixel())[0][1]>(await pixel())[0][0]);await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelector('#darkCirclesStrength').value==='60'&&!document.querySelector('#import').disabled);assert((await pixel())[0][0]>170);
 await set('darkCirclesStrength',90);assert.equal(await page.locator('#darkCirclesStrength').inputValue(),'60');
 await page.locator('#darkCirclesStrength').evaluate(e=>{e.value='40';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>!document.querySelector('#import').disabled);
 const pendingSaved=JSON.parse(await app.evaluate(()=>globalThis.aiSaved.data));assert.equal(pendingSaved.photos[0].effects.stages[0].options.strengthPercent,40,'保存必须应用尚未松手的 AI 调整');assert.equal(pendingSaved.photos[0].effects.image,frames[40]);

 // 第二张目标失败时，第一张已完成的计算也不能半途提交。
 await app.evaluate(()=>{globalThis.aiFailAt=globalThis.aiCalls.length+2;});await page.locator('#mark-all').click();await page.locator('#sync-params').click();await page.waitForFunction(()=>!document.querySelector('#import').disabled);
 const failedSync=await save();assert.equal(failedSync.photos[1].effects,undefined);assert.equal(failedSync.photos[2].effects,undefined);await app.evaluate(()=>{globalThis.aiFailAt=0;});
 await page.locator('#save-preset').click();await page.waitForFunction(()=>!document.querySelector('#import').disabled);const preset=await app.evaluate(()=>globalThis.aiSaved.data);assert.equal(JSON.parse(preset).effects[0].kind,'dark-circles');assert.equal(preset.includes('data:image'),false);
 await page.locator('.photo-item[data-index="1"]').click();await page.locator('#preset-file').setInputFiles({name:'effect.gypreset',mimeType:'application/json',buffer:Buffer.from(preset)});await page.waitForFunction(()=>!document.querySelector('#import').disabled&&document.querySelector('#darkCirclesStrength').value==='40');assert((await pixel())[0][0]>100);
 await page.locator('#format').selectOption('image/png');await page.locator('#export').click();await page.waitForFunction(()=>!document.querySelector('#import').disabled&&document.querySelector('#status').textContent.startsWith('照片已导出'));
 const exported=await app.evaluate(({nativeImage})=>({kind:globalThis.aiSaved.kind,bgra:Array.from(nativeImage.createFromBuffer(Buffer.from(globalThis.aiSaved.data)).toBitmap().subarray(0,4))}));assert.equal(exported.kind,'png');assert(exported.bgra[2]>100);assert.equal(exported.bgra[3],255);
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(root,'dist/ai-effects'+(packaged?'-packaged':'')+'.png')});console.log(JSON.stringify({packaged,inPlace:true,noAccumulation:true,originalCompare:true,history:true,failureRollback:true,zeroRemoves:true,batchSync:true,projectRestore:true,reset:true,errors}));
}finally{await app.evaluate(({app})=>app.exit());}
