// 人工旧工程：两处偏移美牙缓存与 v1/v2 眼部缓存的保存、撤销、重开及全尺寸导出。
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {DEFAULTS} from '../src/model.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sharp=require('../inference/node_modules/sharp');let pw;try{pw=require('playwright');}catch{pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await pw._electron.launch({executablePath:process.env.GUANGYU_TEST_EXECUTABLE||path.join(root,'runtime/electron.exe'),args:[process.env.GUANGYU_TEST_APP_ROOT||root,'--user-data-dir='+path.join(root,'dist/public-legacy-workflow-profile')],env});
try{
 const page=await app.firstWindow();await page.locator('#hand.active').waitFor();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('save-file');ipcMain.handle('save-file',(_e,p)=>{if(p.kind==='project')globalThis.legacyProject=p.data;else globalThis.legacyExport=Array.from(p.data);return {canceled:false};});});
 const original='data:image/png;base64,'+(await sharp({create:{width:96,height:64,channels:4,background:{r:210,g:190,b:140,alpha:180/255}}}).png().toBuffer()).toString('base64'),bits=v=>Array.from(new Uint32Array(new Float32Array(v).buffer));
 const plane=Buffer.alloc(384*384*4);for(let i=0;i<plane.length;i+=4){plane[i+1]=255;plane[i+3]=255;}
 const teeth=[[20/384,6/384,50,0,16/384,12],[16/384,0,12,0,12/384,40]].map(pod=>({format:'guangyu-native-teeth-v3-face',version:1,sourceWH:[96,64],maskWH:[384,384],podSixBits:bits(pod),rgbaBase64:plane.toString('base64')}));
 const points=[30,20];for(let i=0;i<24;i++)points.push(30+12*Math.cos(i*Math.PI/12),20+5*Math.sin(i*Math.PI/12));points.push(...points.slice(2));
 const side={side:0,closed:false,ROI:[14,10,32,20],worldBits:Array(280).fill(0),pupilBits:bits(points),highlightBase64:Buffer.alloc(40000,255).toString('base64')};
 const settled=()=>page.waitForFunction(()=>!document.querySelector('#import').disabled);
 const open=async project=>{await page.locator('#project-file').setInputFiles({name:'legacy.guangyu.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已恢复')&&!document.querySelector('#import').disabled);};
 const save=async()=>{await page.locator('#save-project').click();await settled();return JSON.parse(await app.evaluate(()=>globalThis.legacyProject));};
 const exported=async()=>{await page.locator('#format').selectOption('image/png');await page.locator('#export').click();await settled();return sharp(Buffer.from(await app.evaluate(()=>globalThis.legacyExport))).ensureAlpha().raw().toBuffer();};
 const slider=async(id,v)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);for(const name of ['input','change'])e.dispatchEvent(new Event(name,{bubbles:true}));},v);await settled();};
 await open({version:1,photos:[{name:'legacy.png',original,params:DEFAULTS}]});const base=await exported(),results=[];
 for(const version of [1,2]){
  const eye={format:'guangyu-bright-eye-face',version,sourceWH:[96,64],sides:[side]};if(version===2){const mask=Buffer.alloc(65536);for(let y=0;y<256;y++)mask.fill(255,y*256,y*256+128);eye.extra={plane3Base64:mask.toString('base64'),projectionBits:bits([3,0,0,0,3.2,0,-14/32,-.5,1]),normalizedBits:bits([1,0,0,0,1,0,0,0,1])};}
  await open({version:1,photos:[{name:'legacy.png',original,params:{...DEFAULTS,nativeTeethEnabled:1,nativeTeethMaster:100,nativeTeethWhiten:100,nativeTeethBright:60,brightEyeRightMaster:100},nativeTeethFaces:teeth,brightEyeFaces:[eye]}]});
  const edited=await exported(),saved=await save();assert.equal(saved.photos[0].original,original);assert.deepEqual(saved.photos[0].nativeTeethFaces,teeth);assert.deepEqual(saved.photos[0].brightEyeFaces,[eye]);
  let outside=0,eyeChanges=0,toothChanges=0;for(let y=0;y<64;y++)for(let x=0;x<96;x++){const i=(y*96+x)*4,delta=Math.max(...[0,1,2].map(c=>Math.abs(edited[i+c]-base[i+c])));assert.equal(edited[i+3],base[i+3]);if(delta>1){if(x>=14&&x<46&&y>=10&&y<30){eyeChanges++;if(version===2)assert.ok(x<31,'附加保护排除右半眼区');}else if((x>=49&&x<=79&&y>=11&&y<=29)||(x>=11&&x<=29&&y>=39&&y<=53))toothChanges++;else outside=Math.max(outside,delta);}}
  assert.ok(eyeChanges>5);assert.ok(toothChanges>100);assert.equal(outside,0);
  await open(saved);assert.deepEqual(await exported(),edited);await slider('nativeTeethMaster',0);await slider('brightEyeRightMaster',0);assert.deepEqual(await exported(),base);await page.keyboard.press('Control+z');await settled();await page.keyboard.press('Control+z');await settled();assert.deepEqual(await exported(),edited);results.push({version,eyeChanges,toothChanges,outside});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({legacyProjectRoundTrip:true,zeroIdentity:true,undo:true,originalRetained:true,alphaPreserved:true,originalSizeExport:true,results}));
}finally{await app.evaluate(({app})=>app.exit()).catch(()=>{});}
