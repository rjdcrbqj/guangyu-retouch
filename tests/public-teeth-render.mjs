// 独立颜色与旧缓存兼容测试；只运行光屿自己的 Electron。
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sharp=require('../inference/node_modules/sharp'),pw=(()=>{try{return require('playwright');}catch{return require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}})(),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await pw._electron.launch({executablePath:process.env.GUANGYU_TEST_EXECUTABLE||path.join(root,'runtime/electron.exe'),args:[process.env.GUANGYU_TEST_APP_ROOT||root,'--user-data-dir='+path.join(root,'dist/public-teeth-render-profile')],env});
try{
 const page=await app.firstWindow();await page.locator('#hand.active').waitFor();
 const outputs=await page.evaluate(async()=>{
  const {PhotoEngine}=await import('./src/engine.js'),{DEFAULTS}=await import('./src/model.js');
  const width=96,height=64,c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d'),data=ctx.createImageData(width,height);
  for(let i=0;i<width*height;i++)data.data.set([210,190,140,180],i*4);ctx.putImageData(data,0,0);const image=new Image();image.src=c.toDataURL();await image.decode();
  const mask=document.createElement('canvas');mask.width=width;mask.height=height;const m=mask.getContext('2d');m.fillStyle='#fff';m.fillRect(50,12,20,16);m.fillRect(12,40,16,12);m.fillStyle='rgba(255,255,255,.5)';m.fillRect(70,12,8,16);
  const empty=document.createElement('canvas');empty.width=width;empty.height=height;
  const e=new PhotoEngine(document.createElement('canvas')),out={};
  try{e.setImage(image);e.setMasks(empty,mask);for(const [name,whiten,bright,master]of [['base',0,0,100],['white',100,0,100],['bright',0,100,100],['half',100,0,50],['zero',100,100,0]]){e.render({...DEFAULTS,nativeTeethEnabled:1,nativeTeethMaster:master,nativeTeethWhiten:whiten,nativeTeethBright:bright});out[name]=e.canvas.toDataURL();}
   const cache=document.createElement('canvas');cache.width=cache.height=384;cache.getContext('2d').drawImage(mask,0,0,384,384);const a=cache.getContext('2d').getImageData(0,0,384,384).data;
   for(let i=0;i<a.length;i+=4){a[i]=0;a[i+1]=a[i+3];a[i+2]=0;a[i+3]=255;}
   const faces=[{format:'guangyu-native-teeth-v3-face',version:1,sourceWH:[width,height],maskWH:[384,384],podSixBits:Array.from(new Uint32Array(new Float32Array([width/384,0,0,0,height/384,0]).buffer)),rgbaBase64:btoa(String.fromCharCode(...a.subarray(0,0)))}];
   let binary='';for(let i=0;i<a.length;i+=8192)binary+=String.fromCharCode(...a.subarray(i,i+8192));faces[0].rgbaBase64=btoa(binary);
   e.setMasks(empty,empty,empty,faces);e.render({...DEFAULTS,nativeTeethEnabled:1,nativeTeethMaster:100,nativeTeethWhiten:100,nativeTeethBright:0});out.legacy=e.canvas.toDataURL();
   const solid=new Uint8Array(384*384*4);for(let i=0;i<solid.length;i+=4){solid[i+1]=255;solid[i+3]=255;}let raw='';for(let i=0;i<solid.length;i+=8192)raw+=String.fromCharCode(...solid.subarray(i,i+8192));
   const localized=[[20/384,6/384,50,0,16/384,12],[16/384,0,12,0,12/384,40]].map(pod=>({...faces[0],podSixBits:Array.from(new Uint32Array(new Float32Array(pod).buffer)),rgbaBase64:btoa(raw)}));
   e.setMasks(empty,empty,empty,localized);e.render({...DEFAULTS,nativeTeethEnabled:1,nativeTeethMaster:100,nativeTeethWhiten:100,nativeTeethBright:0});out.multiface=e.canvas.toDataURL();return out;
  }finally{e.dispose();}
 });
 const decoded={};for(const [name,url]of Object.entries(outputs))decoded[name]=await sharp(Buffer.from(url.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
 const pixel=(name,x,y)=>Array.from(decoded[name].subarray((y*96+x)*4,(y*96+x)*4+4)),luma=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
 assert.deepEqual(decoded.zero,decoded.base);
 const base=pixel('base',60,20),white=pixel('white',60,20),bright=pixel('bright',60,20),half=pixel('half',60,20);
 assert.ok(white[0]-white[2]<base[0]-base[2]-15,'祛黄降低黄色差');
 assert.ok(Math.abs(luma(white)-luma(base))<2,'祛黄保持亮度');
 assert.ok(luma(bright)>luma(base)+8,'明度独立提高亮度');
 assert.ok(Math.abs((bright[0]-bright[2])-(base[0]-base[2]))<3,'明度保持色差');
 assert.ok(Math.abs(half[2]-base[2])<Math.abs(white[2]-base[2]));
 for(const name of ['white','bright','half','legacy','multiface']){let changed=0;for(let y=0;y<64;y++)for(let x=0;x<96;x++){const a=pixel(name,x,y),b=pixel('base',x,y);assert.equal(a[3],b[3],name+' alpha');const delta=Math.max(...a.slice(0,3).map((v,i)=>Math.abs(v-b[i])));if(delta>1){changed++;assert.ok((x>=49&&x<=79&&y>=11&&y<=29)||(x>=11&&x<=29&&y>=39&&y<=53),name+' outside '+[x,y]);}}assert.ok(changed>50,name);}
 assert.ok(pixel('white',74,20)[2]>base[2]&&pixel('white',74,20)[2]<white[2],'软边连续');
 assert.ok(Math.abs(pixel('legacy',60,20)[2]-white[2])<=2,'旧绿通道缓存');
 assert.ok(pixel('multiface',60,20)[2]>base[2]+20&&pixel('multiface',20,46)[2]>base[2]+20,'两个独立非中心缓存');
 console.log(JSON.stringify({legacyAffineAndMultipleFaces:true,independentColorControls:true,ordinaryAndLegacyMasks:true,softEdges:true,multipleRegions:true,alphaPreserved:true,zeroIdentity:true,base,white,bright,half}));
}finally{await app.evaluate(({app})=>app.exit()).catch(()=>{});}
