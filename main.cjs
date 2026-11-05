const {app,BrowserWindow,ipcMain,dialog,Menu,net}=require('electron');
const {spawn}=require('node:child_process');
const {UpdateService,createUpdateFetch}=require('./updates.cjs');
const updateConfig=require('./update-config.json');
const path=require('node:path');const fs=require('node:fs/promises');
const {PublicSelection}=require('./inference/public-selection/service.cjs');
const {PublicFaceDetector}=require('./inference/public-yunet/detector.cjs');const faceDetector=new PublicFaceDetector();
const {PublicFaceLandmarks}=require('./inference/public-landmarks/service.cjs');const publicLandmarks=new PublicFaceLandmarks();
const {PublicTeethSegmenter}=require('./inference/public-teeth/service.cjs');const publicTeeth=new PublicTeethSegmenter({landmarks:publicLandmarks});
const {PublicPortraitSegmenter}=require('./inference/public-segmentation/service.cjs');const publicPortrait=new PublicPortraitSegmenter({landmarks:publicLandmarks});
const {PublicFaceRegions}=require('./inference/public-face-regions.cjs');const publicRegions=new PublicFaceRegions({landmarks:publicLandmarks});
let portraitRunning=false;
let wrinkleService,portraitRepairService,brightEyeService,eyeBagService,darkCirclesService,lipWrinkleService,skinUnifyService,skinReferenceProcessor;
const {ExportSessions}=require('./export-session.cjs');const exportsQueue=new ExportSessions();
let nativeSelection,updater,pendingInstaller;
function originalBytes(data){if(typeof data!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(data)||data.length>85*1024*1024)throw new Error('照片数据无效');return Buffer.from(data.slice(data.indexOf(',')+1),'base64');}
app.setName('光屿修图');let window;
app.whenReady().then(()=>{
 nativeSelection=new PublicSelection();
 Menu.setApplicationMenu(null);
 window=new BrowserWindow({width:1460,height:940,minWidth:1120,minHeight:740,backgroundColor:'#171f29',title:'光屿修图',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.on('closed',()=>{Promise.allSettled([wrinkleService?.close(),portraitRepairService?.close(),publicPortrait.close(),publicRegions.close(),publicTeeth.close(),nativeSelection?.close(),brightEyeService?.close(),darkCirclesService?.close(),eyeBagService?.close(),lipWrinkleService?.close(),skinUnifyService?.close(),skinReferenceProcessor?.close()]).then(results=>{for(const r of results)if(r.status==='rejected')console.error('离线分区后端释放失败',r.reason);});});
 window.webContents.on('will-navigate',event=>event.preventDefault());
 window.webContents.on('will-prevent-unload',event=>{const answer=dialog.showMessageBoxSync(window,{type:'question',buttons:['继续编辑','不保存并退出'],defaultId:0,cancelId:0,message:'当前工程尚未保存',detail:'退出后会丢失本次编辑。照片原文件不会改变。'});if(answer===1)event.preventDefault();else if(pendingInstaller){pendingInstaller=null;updater.cancelInstall();}});
 updater=new UpdateService({repository:updateConfig.repository,currentVersion:app.getVersion(),downloadDir:path.join(app.getPath('userData'),'updates'),fetchImpl:createUpdateFetch(net)});
 updater.on('state',state=>{if(window&&!window.isDestroyed())window.webContents.send('update-state',state);});
 ipcMain.handle('update-status',()=>updater.snapshot());
 ipcMain.handle('update-check',()=>updater.check());
 ipcMain.handle('update-download',()=>updater.download());
 ipcMain.handle('update-cancel',()=>{updater.cancelDownload();return updater.snapshot();});
 ipcMain.handle('app-info',async()=>({version:app.getVersion(),examplesAvailable:await fs.access(path.join(__dirname,'inference/assets/examples/01.jpg')).then(()=>true,()=>false)}));
 ipcMain.handle('update-install',async()=>{
  if(!app.isPackaged)throw Error('请从已安装的桌面版中安装更新');
  if(pendingInstaller)return updater.snapshot();
  const file=await updater.verifiedInstaller();pendingInstaller=file;updater.markInstalling();window.close();return updater.snapshot();
 });
 setTimeout(()=>updater.check(),5000).unref();setInterval(()=>updater.check(),4*60*60*1000).unref();
 window.loadFile(path.join(__dirname,'index.html'));
 ipcMain.handle('native-inspect',async(_event,original)=>nativeSelection.inspect(originalBytes(original)));
 ipcMain.handle('native-import-feature',async(_event,{original,text})=>Promise.reject(new Error('新版点选直接使用照片，无需导入原生特征。')));
 ipcMain.handle('native-segment',async(_event,payload)=>nativeSelection.segment(originalBytes(payload.original),payload.points,payload.width,payload.height));
 ipcMain.handle('face-skin',async(_event,payload)=>publicPortrait.segment(originalBytes(payload.original),payload.box,payload.width,payload.height,'skin'));
 ipcMain.handle('portrait-repair',async(_event,payload)=>{
  if(!payload||typeof payload.strengths!=='object'||payload.strengths===null)throw new Error('净肤参数无效');
  if(portraitRunning)throw new Error('正在处理人像，请稍候');
  portraitRunning=true;
  try{if(!portraitRepairService){const {PublicPortraitRepairService}=require('./inference/public-portrait-repair/service.cjs');portraitRepairService=new PublicPortraitRepairService({detector:faceDetector,segmentation:publicPortrait});}const result=await portraitRepairService.repair(originalBytes(payload.original),{strengths:payload.strengths});return {...result,png:result.png.toString('base64')};}
  finally{portraitRunning=false;}
 });
 ipcMain.handle('wrinkle-repair',async(_event,payload)=>{
  if(!payload||(payload.regionsPercent===undefined&&(!Number.isFinite(payload.strength)||payload.strength<=0||payload.strength>1)))throw new Error('祛皱参数无效');
  require('./inference/wrinkle-region-parameters.cjs').resolveWrinkleStrengths({strength:payload.strength,regionsPercent:payload.regionsPercent});
  if(portraitRunning)throw new Error('正在处理人像，请稍候');
  portraitRunning=true;
  try{if(!wrinkleService){const {PublicWrinkleService}=require('./inference/public-wrinkle/service.cjs');wrinkleService=new PublicWrinkleService({detector:faceDetector,segmentation:publicPortrait});}const result=await wrinkleService.repair(originalBytes(payload.original),{strength:payload.strength,regionsPercent:payload.regionsPercent});return {...result,png:result.png.toString('base64')};}
  finally{portraitRunning=false;}
 });
 ipcMain.handle('eye-bag-repair',async(_event,payload)=>{
  if(portraitRunning)throw new Error('正在处理人像，请稍候');
  const bytes=originalBytes(payload?.original);portraitRunning=true;
  try{if(!eyeBagService){const {PublicEyeBagService}=require('./inference/public-eye-bag/service.cjs');eyeBagService=new PublicEyeBagService({detector:faceDetector,landmarks:publicLandmarks,segmentation:publicPortrait});}const result=await eyeBagService.repair(bytes,{primaryPercent:payload.primaryPercent,secondaryPercent:payload.secondaryPercent});return {...result,png:result.png.toString('base64')};}
  finally{portraitRunning=false;}
 });
 ipcMain.handle('dark-circles-repair',async(_event,payload)=>{
  if(portraitRunning)throw new Error('正在处理人像，请稍候');
  const bytes=originalBytes(payload?.original);portraitRunning=true;
  try{if(!darkCirclesService){const {PublicDarkCirclesService}=require('./inference/public-dark-circles/service.cjs');darkCirclesService=new PublicDarkCirclesService({detector:faceDetector,landmarks:publicLandmarks,segmentation:publicPortrait});}const result=await darkCirclesService.repair(bytes,{strengthPercent:payload.strengthPercent});return {...result,png:result.png.toString('base64')};}
  finally{portraitRunning=false;}
 });
 ipcMain.handle('lip-wrinkle-repair',async(_event,payload)=>{
  const {PublicLipWrinkleService,strengthFromPercent}=require('./inference/public-lip-wrinkle/service.cjs');strengthFromPercent(payload?.strengthPercent);
  if(portraitRunning)throw new Error('正在处理人像，请稍候');
  const bytes=originalBytes(payload?.original);portraitRunning=true;
  try{if(!lipWrinkleService)lipWrinkleService=new PublicLipWrinkleService({detector:faceDetector,landmarks:publicLandmarks,fallback:publicRegions.fallback});const result=await lipWrinkleService.repair(bytes,{strengthPercent:payload.strengthPercent});return {...result,png:result.png.toString('base64')};}finally{portraitRunning=false;}
 });
 ipcMain.handle('skin-unify-repair',async(_event,payload)=>{
  const {PublicSkinUnifyService,strengthFromPercent}=require('./inference/public-skin-unify/service.cjs');strengthFromPercent(payload?.strengthPercent);
  if(portraitRunning)throw new Error('正在处理人像，请稍候');
  const bytes=originalBytes(payload?.original);portraitRunning=true;
  try{if(!skinUnifyService)skinUnifyService=new PublicSkinUnifyService({detector:faceDetector,segmentation:publicPortrait});const result=await skinUnifyService.repair(bytes,{strengthPercent:payload.strengthPercent});return {...result,png:result.png.toString('base64')};}finally{portraitRunning=false;}
 });
 ipcMain.handle('bright-eye',async(_event,payload)=>{
  if(portraitRunning)throw new Error('正在处理人像，请稍候');
  const bytes=originalBytes(payload?.original);portraitRunning=true;
  try{if(!brightEyeService){const {PublicBrightEyeService}=require('./inference/public-bright-eye/service.cjs');brightEyeService=new PublicBrightEyeService({landmarks:publicLandmarks,detector:faceDetector});}return await brightEyeService.prepare(bytes);}
  finally{portraitRunning=false;}
 });
 ipcMain.handle('auto-portrait',async(_event,payload)=>{
  if(!payload||!['skin','hair','lips','eyebrows','teeth'].includes(payload.kind))throw new Error('请选择已支持的人像分区');
  if(!Number.isInteger(payload.width)||!Number.isInteger(payload.height)||payload.width<1||payload.height<1||payload.width>1600||payload.height>1600)throw new Error('选区尺寸无效');
  if(portraitRunning)throw new Error('正在识别人像，请稍候');
  portraitRunning=true;const start=performance.now();
  try{
   const bytes=originalBytes(payload.original),detection=await faceDetector.detect(bytes);
   const boxes=detection.boxes.slice(0,12),masks=[],nativeTeethFaces=[];
   for(const box of boxes){const backend=payload.kind==='hair'||payload.kind==='skin'?publicPortrait:payload.kind==='lips'||payload.kind==='eyebrows'?publicRegions:publicTeeth;const result=await backend.segment(bytes,box,payload.width,payload.height,payload.kind);if(payload.kind!=='teeth'||result.foregroundFraction>0){masks.push(result.mask);if(result.nativeTeethFace)nativeTeethFaces.push(result.nativeTeethFace);}}
   return {boxes,masks,nativeTeethFaces,total:detection.boxes.length,seconds:(performance.now()-start)/1000};
  }finally{portraitRunning=false;}
 });
 ipcMain.handle('native-examples',async()=>Promise.all(['01','02','03','04','05','06'].map(async id=>({name:id+'.jpg',original:'data:image/jpeg;base64,'+(await fs.readFile(path.join(__dirname,'inference/assets/examples',id+'.jpg'))).toString('base64')}))));
 ipcMain.handle('batch-begin',async()=>{const choice=await dialog.showOpenDialog(window,{title:'选择批量导出位置',properties:['openDirectory','createDirectory']});if(choice.canceled)return {canceled:true};return {canceled:false,...await exportsQueue.begin(choice.filePaths[0])};});
 ipcMain.handle('batch-write',async(_event,{id,name,data})=>exportsQueue.write(id,name,data));
 ipcMain.handle('batch-finish',async(_event,id)=>exportsQueue.finish(id));
 ipcMain.handle('save-file',async(_event,{kind,name,data})=>{
  if(!['png','jpg','project','preset'].includes(kind))throw new Error('不支持的文件格式');
  const filters=kind==='project'?[{name:'光屿工程',extensions:['guangyu.json']}]:kind==='preset'?[{name:'光屿预设',extensions:['gypreset']}]:[{name:kind.toUpperCase(),extensions:[kind]}];
  const choice=await dialog.showSaveDialog(window,{defaultPath:path.join(app.getPath('pictures'),path.basename(name)),filters});
  if(choice.canceled)return {canceled:true};
  const buffer=['project','preset'].includes(kind)?Buffer.from(data,'utf8'):Buffer.from(data);
  await fs.writeFile(choice.filePath,buffer);return {canceled:false,path:choice.filePath};
 });
});
 ipcMain.handle('skin-reference',async(_event,payload)=>{
  if(!skinReferenceProcessor){const {PublicReferenceService}=require('./inference/skin-reference/public-service.cjs');
   skinReferenceProcessor=new PublicReferenceService();}
  const {createSkinReferenceHandler}=require('./inference/skin-reference/ipc.cjs');
  return createSkinReferenceHandler({processor:skinReferenceProcessor})(_event,payload);
 });

 // 后端可用性查询：让界面在真正提交作业前知道参考处理是否就绪，而不是静默失败。
 ipcMain.handle('skin-reference-status',async()=>{
  try{
   require('./inference/skin-reference/processor.cjs');
   return {available:true,backend:'public-reference-transfer'};
  }catch(error){return {available:false,reason:error.message};}
 });
// 窗口真正关闭后再释放人像处理会话，避免取消退出时提前关闭选区后端。
app.on('window-all-closed',()=>{Promise.allSettled([wrinkleService?.close(),portraitRepairService?.close(),publicPortrait.close(),publicRegions.close(),publicTeeth.close(),faceDetector.close(),brightEyeService?.close(),eyeBagService?.close(),darkCirclesService?.close(),lipWrinkleService?.close(),skinUnifyService?.close(),skinReferenceProcessor?.close(),nativeSelection?.close()]).then(results=>{for(const r of results)if(r.status==='rejected')console.error('人像后端释放失败',r.reason);}).finally(()=>app.quit());});

// 只有窗口真正退出后才运行已校验的安装包；取消退出不会安装。
app.on('will-quit',()=>{
 if(!pendingInstaller)return;
 const child=spawn(pendingInstaller,['/S','/UPDATE','/WAITPID='+process.pid,'/D='+path.dirname(process.execPath)],{detached:true,stdio:'ignore',windowsHide:true,windowsVerbatimArguments:true});
 child.on('error',error=>console.error('更新安装未能启动',error.message));child.unref();
});
