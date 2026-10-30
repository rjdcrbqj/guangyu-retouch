// 自有应用端到端检查：合成图片、不启动原软件、不调用人像模型。
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;playwright=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const {_electron}=playwright;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),packaged=process.argv.includes('--packaged');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:path.join(root,packaged?'dist/payload/光屿修图.exe':'runtime/electron.exe'),args:[...(packaged?[]:[root]),'--user-data-dir='+path.join(root,'dist/workflow-test-profile')],env,timeout:45000});
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await page.locator('#hand.active').waitFor();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=960;c.height=640;const x=c.getContext('2d');x.fillStyle='#735c49';x.fillRect(0,0,960,640);x.fillStyle='#eab989';x.fillRect(120,100,300,400);return c.toDataURL().split(',')[1];});
 await page.locator('#files').setInputFiles([1,2,3].map(i=>({name:`sample-${i}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')})));
 await page.waitForFunction(()=>document.querySelector('#photo-count').textContent==='3 张'&&!document.querySelector('#import').disabled);
 const stage=await page.locator('.stage').boundingBox(),library=await page.locator('.library').boundingBox();assert(library.y>=stage.y+stage.height-1,'照片栏应在画布底部');
 const setValue=async(id,value)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);};
 const exposure=async value=>{await page.waitForFunction(v=>Number(document.querySelector('#exposure').value)===v&&!document.querySelector('#import').disabled,value);};
 await setValue('exposure',.25);await page.locator('#mark-all').click();await page.locator('#sync-params').click();
 await page.locator('.photo-item[data-index="2"]').click();await exposure(.25);
 await page.keyboard.press('Control+Alt+z');await page.waitForFunction(()=>document.querySelector('#file-name').textContent==='sample-1.png');
 await page.keyboard.press('Control+Alt+z');await exposure(.25); // 源照片不变。
 // 通过保存的工程核对全部目标，避免额外切换照片改变全局历史。
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('save-file');ipcMain.handle('save-file',(_event,payload)=>{globalThis.workflowSaved=payload;return {canceled:false};});});
 const save=async()=>{await page.locator('#save-project').click();await page.waitForFunction(()=>!document.querySelector('#save-project').disabled);return JSON.parse(await app.evaluate(()=>globalThis.workflowSaved.data));};
 assert.deepEqual((await save()).photos.map(p=>p.params.exposure),[.25,0,0]);
 await page.keyboard.press('Control+Alt+Shift+z');await exposure(.25);assert.deepEqual((await save()).photos.map(p=>p.params.exposure),[.25,.25,.25]);
 await page.locator('.photo-item[data-index="1"]').click();await setValue('contrast',20);await page.locator('.photo-item[data-index="0"]').click();
 await setValue('exposure',.5);await page.locator('#sync-mode').selectOption('changed');await page.locator('#sync-params').click();
 assert.equal((await save()).photos[1].params.contrast,20);
 await page.locator('.photo-item[data-index="1"]').click();await page.keyboard.press('Control+z');await exposure(.25);assert.equal(await page.locator('#contrast').inputValue(),'20');
 await page.keyboard.press('Control+Shift+z');await exposure(.5);
 // 滑杆只有 input、尚无 change 时快捷保存，文件与当前撤销链仍一致。
 await page.locator('#exposure').evaluate(e=>{e.value='1';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>!document.querySelector('#save-project').disabled);
 const liveSaved=JSON.parse(await app.evaluate(()=>globalThis.workflowSaved.data));assert.equal(liveSaved.photos[1].params.exposure,1);
 assert.equal(liveSaved.photos[1].history.items[liveSaved.photos[1].history.index].params.exposure,1);
 await page.keyboard.press('Control+z');await exposure(.5);
 const saved=await save();await page.locator('#project-file').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已恢复'));
 assert.equal(await page.locator('#global-undo').isDisabled(),true);await page.keyboard.press('Control+z');await exposure(.25);
 await page.keyboard.press('Control+Shift+z');await exposure(.5);
 await page.getByRole('button',{name:'快捷键设置',exact:true}).click();await page.locator('#shortcut-search').fill('全局');assert.equal(await page.locator('.shortcut-row').count(),2);await page.locator('#shortcut-close').click();
 await page.locator('#zoom').selectOption('fit');await page.screenshot({path:path.join(root,'dist/workflow-084'+(packaged?'-packaged':'')+'.png')});
 await page.setViewportSize({width:1100,height:760});
 const smallStage=await page.locator('.stage').boundingBox(),smallLibrary=await page.locator('.library').boundingBox(),toolbar=await page.locator('.stage-toolbar').boundingBox(),zoom=await page.locator('#zoom').boundingBox();
 assert(smallLibrary.y>=smallStage.y+smallStage.height-1);assert(zoom.x+zoom.width<=toolbar.x+toolbar.width);assert(smallStage.height>350);
 await page.screenshot({path:path.join(root,'dist/workflow-084-small'+(packaged?'-packaged':'')+'.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({packaged,bottomFilmstrip:true,globalUndoRedo:true,changedOnlySync:true,photoUndoRedo:true,projectHistory:true,shortcuts:true,errors}));
}finally{await app.evaluate(({app})=>app.exit());}
