'use strict';
const path=require('node:path');
const {randomUUID}=require('node:crypto');

class PublicSegmentationRuntime{
 constructor({workerFile=path.join(__dirname,'worker.html'),taskName='Segmentation'}={}){
  if(!['Segmentation','Landmarks','Selection'].includes(taskName))throw new Error('离线任务类别无效');
  this.workerFile=workerFile;this.taskName=taskName;this.window=null;this.ready=null;this.closed=false;this.closing=null;
 }
 // 超时会丢弃整个离线执行环境；下次调用可以重新初始化。
 async deadline(job,win){
  let timer,onGone,onClosed;const contents=win.webContents;
  const stopped=new Promise((_,reject)=>{
   onGone=()=>reject(new Error('人像分区运行环境已退出，请重试'));
   onClosed=()=>reject(new Error('人像分区运行环境已关闭，请重试'));
   contents.once('render-process-gone',onGone);win.once('closed',onClosed);
  });
  try{return await Promise.race([job,stopped,new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('人像分区处理超时，请重试'));if(!win.isDestroyed())win.destroy();},30000);})]);}
  finally{clearTimeout(timer);contents.removeListener('render-process-gone',onGone);win.removeListener('closed',onClosed);}
 }
 async initialize(){
  if(this.closed)throw new Error('人像分区服务已关闭');
  if(!this.ready)this.ready=(async()=>{
   const {BrowserWindow}=require('electron');
   const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'public-segmentation-'+randomUUID()}});
   this.window=win;
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   win.webContents.on('will-navigate',event=>event.preventDefault());
   win.webContents.on('render-process-gone',()=>{if(!win.isDestroyed())win.destroy();}); // 丢弃崩溃的执行页，下一次调用重建。
   win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true})); // 禁止离线执行页联网。
   win.on('closed',()=>{if(this.window===win){this.window=null;this.ready=null;}});
   try{
    await this.deadline(win.loadFile(this.workerFile),win);
    await this.deadline(win.webContents.executeJavaScript('window.initializePublic'+this.taskName+'()'),win);
    return win;
   }catch(error){if(!win.isDestroyed())win.destroy();throw error;}
  })().catch(error=>{this.ready=null;throw error;});
  return this.ready;
 }
 async run(request){
  if(this.closed)throw new Error('人像分区服务已关闭');
  const win=await this.initialize();
  return this.deadline(win.webContents.executeJavaScript('window.runPublic'+this.taskName+'('+JSON.stringify(request)+')'),win);
 }
 async close(){
  this.closed=true;
  if(!this.closing)this.closing=(async()=>{
   const win=await this.ready?.catch(()=>null);
   if(win&&!win.isDestroyed()){
    try{await this.deadline(win.webContents.executeJavaScript('window.closePublic'+this.taskName+'()'),win);}
    finally{if(!win.isDestroyed())win.destroy();}
   }
  })();
  return this.closing;
 }
}
module.exports={PublicSegmentationRuntime};
