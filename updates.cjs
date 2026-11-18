'use strict';
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {createReadStream,createWriteStream}=require('node:fs');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const INSTALLER='GuangyuRetouchSetup.exe';
const suspended=new Error('退出前已暂停下载');
const allowedHosts=new Set(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com']);

function versionParts(value){
 const match=/^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(value);
 if(!match)throw Error('版本号格式无效');return match.slice(1).map(Number);
}
function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
function validateUrl(value){const url=new URL(value);if(url.protocol!=='https:'||!allowedHosts.has(url.hostname)||url.username||url.password||url.port)throw Error('更新地址不属于可信的 GitHub 下载服务');return url;}
async function fileDigest(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function partialSize(file,limit){
 const info=await fs.lstat(file).catch(()=>null);
 return info?.isFile()&&info.size<=limit?info.size:0;
}

// Electron net.fetch 的手动跳转会报错；用 net.request 逐跳返回，由更新器检查目的地址。
function createElectronFetch(net){
 return (url,{signal,headers={}}={})=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason??new DOMException('Canceled','AbortError'));return;}
  const request=net.request({url:String(url),method:'GET',redirect:'manual',credentials:'omit'});
  let settled=false,response;
  const fail=error=>{if(!settled){settled=true;reject(error);}};
  const abort=()=>{const error=signal.reason??new DOMException('Canceled','AbortError');fail(error);response?.destroy(error);request.abort();};
  request.once('close',()=>signal?.removeEventListener('abort',abort));
  request.on('error',fail);
  request.once('redirect',(status,_method,location)=>{
   settled=true;resolve(new Response(null,{status,headers:{location}}));request.abort();
  });
  request.once('response',incoming=>{
   response=incoming;incoming.once('aborted',()=>incoming.destroy(new DOMException('Canceled','AbortError')));
   const responseHeaders=new Headers();for(const [key,value] of Object.entries(incoming.headers))responseHeaders.set(key,Array.isArray(value)?value.join(', '):value);
   settled=true;resolve(new Response(Readable.toWeb(incoming),{status:incoming.statusCode,headers:responseHeaders}));
  });
  for(const [key,value] of Object.entries(headers))request.setHeader(key,value);
  signal?.addEventListener('abort',abort,{once:true});request.end();
 });
}

// 优先使用直接下载通道；连接失败时兼容系统代理，取消操作不会触发重试。
function createUpdateFetch(net,primary=globalThis.fetch){
 const fallback=createElectronFetch(net);
 return async(url,options={})=>{
  try{return await primary(url,options);}
  catch(error){if(options.signal?.aborted)throw error;return fallback(url,options);}
 };
}

// 只从固定公开仓库读取更新；客户端不保存 GitHub 登录凭据。
class UpdateService extends EventEmitter{
 constructor({repository,currentVersion,downloadDir,fetchImpl=globalThis.fetch}){
  super();if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw Error('更新仓库格式无效');versionParts(currentVersion);
  this.repository=repository;this.currentVersion=currentVersion;this.downloadDir=downloadDir;this.fetchImpl=fetchImpl;
  this.state={status:'idle',currentVersion,message:'可手动检查更新'};this.available=null;this.transfer=null;this.checkPromise=null;
 }
 snapshot(){return {...this.state};}
 setState(status,extra={}){this.state={...this.state,status,...extra};this.emit('state',this.snapshot());return this.snapshot();}
 async response(url,{signal,headers={}}={}){
  let next=String(url);
  for(let i=0;i<=5;i++){
   validateUrl(next);const response=await this.fetchImpl(next,{redirect:'manual',signal,headers:{'User-Agent':'GuangyuRetouch/'+this.currentVersion,Accept:'application/vnd.github+json',...headers}});
   if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('更新下载地址无效');next=new URL(location,next).href;continue;
   }
   if(!response.ok){await response.body?.cancel();const error=Error(response.status===404?'暂未找到已发布版本':'暂时无法连接 GitHub，请稍后重试');error.status=response.status;throw error;}
   return response;
  }
  throw Error('更新下载重定向次数过多');
 }
 async json(url,limit){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{const response=await this.response(url,{signal:controller.signal});let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('更新信息超过允许大小');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  finally{clearTimeout(timer);}
 }
 assetUrl(release,name){
  const asset=release.assets?.find(asset=>asset.name===name&&asset.state==='uploaded');if(!asset)throw Error('本版本安装包尚未准备完成');
  const url=validateUrl(asset.browser_download_url);
  if(url.origin!=='https://github.com'||decodeURIComponent(url.pathname)!==`/${this.repository}/releases/download/${release.tag_name}/${name}`)throw Error('更新资源与发布仓库不匹配');
  return asset;
 }
 async check(){
  if(this.transfer||['downloaded','installing'].includes(this.state.status))return this.snapshot();
  if(this.checkPromise)return this.checkPromise;
  this.checkPromise=this.checkOnce().finally(()=>{this.checkPromise=null;});return this.checkPromise;
 }
 async checkOnce(){
  this.setState('checking',{message:'正在检查新版本…'});
  try{
   const release=await this.json(`https://api.github.com/repos/${this.repository}/releases/latest`,1024*1024);
   if(release.draft||release.prerelease)throw Error('没有可用的正式版本');
   const version=versionParts(release.tag_name).join('.');
   if(compareVersions(version,this.currentVersion)<=0){this.available=null;return this.setState('current',{latestVersion:version,message:'当前已是最新版本'});}
   const manifestAsset=this.assetUrl(release,'update.json'),installer=this.assetUrl(release,INSTALLER);
   const manifest=await this.json(manifestAsset.browser_download_url,65536);
   if(manifest.version!==version||manifest.installer!==INSTALLER||!/^[a-f0-9]{64}$/i.test(manifest.sha256)||!Number.isSafeInteger(manifest.size)||manifest.size<1||manifest.size>=2*1024**3||manifest.size!==installer.size)throw Error('更新清单不完整或与安装包不一致');
   if(installer.digest&&installer.digest.toLowerCase()!=='sha256:'+manifest.sha256.toLowerCase())throw Error('GitHub 文件校验信息不一致');
   this.available={...manifest,url:installer.browser_download_url};
   const {bytes:downloadedBytes}=await this.bestPartial(manifest);
   return this.setState('available',{latestVersion:version,notes:String(release.body??'').slice(0,30000),releaseUrl:`https://github.com/${this.repository}/releases/tag/${release.tag_name}`,totalBytes:manifest.size,downloadedBytes,percent:Math.floor(downloadedBytes/manifest.size*100),message:'发现新版本 '+version+(downloadedBytes?'，可继续下载':'')});
  }catch(error){return this.setState(error.status===404?'current':'error',{message:error.message??'检查更新失败，请稍后重试'});}
 }
 partialPrefix(update){return `${INSTALLER}.${update.sha256.toLowerCase()}.`;}
 // 并行失败的片段单独保存，重试选最长的记录，短下载不会覆盖它。
 async bestPartial(update){
  const prefix=this.partialPrefix(update);
  const names=await fs.readdir(this.downloadDir).catch(()=>[]);
  let best={file:null,bytes:0};
  for(const name of names){
   if(!name.startsWith(prefix)||!/^[a-f0-9-]{36}\.resume$/.test(name.slice(prefix.length)))continue;
   const file=path.join(this.downloadDir,name),bytes=await partialSize(file,update.size);
   if(bytes>best.bytes)best={file,bytes};
  }
  return best;
 }
 // 仅按可信清单的字节范围追加。服务器不支持续传时仍可回到完整下载。
 async installerResponse(update,offset,signal){
  const fetch=range=>this.response(update.url,{signal,headers:{'Accept-Encoding':'identity',...(range?{Range:`bytes=${range}-`}:{})}});
  let response;
  try{response=await fetch(offset);}
  catch(error){if(!offset||error.status!==416)throw error;}
  if(response?.status===200&&response.body)return {response,offset:0};
  const range=`bytes ${offset}-${update.size-1}/${update.size}`;
  const encoding=response?.headers.get('content-encoding');
  if(offset&&response?.status===206&&response.body&&response.headers.get('content-range')===range&&(!encoding||encoding==='identity'))return {response,offset};
  await response?.body?.cancel();
  if(offset){response=await fetch(0);if(response.status===200&&response.body)return {response,offset:0};await response.body?.cancel();}
  throw Error('下载服务返回了无效的安装包范围，请重试');
 }
 async download(){
  if(this.checkPromise||this.transfer||['downloaded','installing'].includes(this.state.status))return this.snapshot();
  if(!this.available)throw Error('请先检查更新');
  const active={controller:new AbortController(),cancelled:false,committing:false};
  this.transfer=active;
  active.promise=this.downloadFile(active);
  try{return await active.promise;}
  finally{if(this.transfer===active)this.transfer=null;}
 }
 async downloadFile(active){
  const update={...this.available},{controller}=active;
  const staging=path.join(this.downloadDir,this.partialPrefix(update)+randomUUID());
  const saved=staging+'.resume',part=staging+'.part',file=path.join(this.downloadDir,INSTALLER);
  this.setState('downloading',{message:'正在下载更新…'});
  const idleError=new Error('下载连接超时，请重试');
  let idleTimer,discard=false;
  const resetTimeout=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>controller.abort(idleError),45000);};
  const progressBytes=bytes=>({downloadedBytes:bytes,percent:Math.floor(bytes/update.size*100)});
  try{
   await fs.mkdir(this.downloadDir,{recursive:true});
   // 每次下载使用独占临时路径，两个进程无法向同一个文件追加。
   const previous=await this.bestPartial(update);
   if(previous.file)try{await fs.rename(previous.file,part);}catch(error){if(error.code!=='ENOENT')throw error;}
   const offset=await partialSize(part,update.size);
   if(!offset)await fs.rm(part,{force:true});
   controller.signal.throwIfAborted();
   if(offset<update.size){
    resetTimeout();
    const transfer=await this.installerResponse(update,offset,controller.signal);
    let downloaded=transfer.offset,lastProgress=0;
    this.setState('downloading',{...progressBytes(downloaded),message:downloaded?'正在继续下载更新…':'正在下载更新…'});
    const progress=new Transform({transform:(chunk,_encoding,done)=>{
     downloaded+=chunk.length;resetTimeout();
     if(downloaded>update.size){discard=true;return done(Error('安装包大小与更新信息不一致'));}
     if(Date.now()-lastProgress>250){lastProgress=Date.now();this.setState('downloading',progressBytes(downloaded));}
     done(null,chunk);
    }});
    await pipeline(Readable.fromWeb(transfer.response.body),progress,createWriteStream(part,{flags:transfer.offset?'a':'w'}),{signal:controller.signal});
    if(downloaded!==update.size)throw Error('更新下载提前结束');
   }
   clearTimeout(idleTimer);
   if(await fileDigest(part)!==update.sha256.toLowerCase()){discard=true;throw Error('安装包完整性校验失败，请重新下载');}
   controller.signal.throwIfAborted();
   // 完整包开始提交后只剩原子改名，界面同时收起取消按钮。
   active.committing=true;
   this.setState('verifying',{...progressBytes(update.size),message:'正在准备已校验的安装包…'});
   await fs.rename(part,file);this.downloaded={...update,file};
   return this.setState('downloaded',{downloadedBytes:update.size,percent:100,message:'下载完成，可选择安装并重启'});
  }catch(error){
   clearTimeout(idleTimer);
   let savedBytes=0;
   if(!active.cancelled&&!discard){
    const size=await partialSize(part,update.size);
    if(size&&!active.cancelled)try{await fs.rename(part,saved);savedBytes=size;}catch{}
   }
   await fs.rm(part,{force:true}).catch(()=>{});
   if(active.cancelled&&savedBytes){await fs.rm(saved,{force:true}).catch(()=>{});savedBytes=0;}
   const reason=controller.signal.reason;
   const message=active.cancelled?'已取消下载':reason===idleError||reason===suspended?reason.message:error.message;
   return this.setState(controller.signal.aborted?'available':'error',{...progressBytes(savedBytes),message:savedBytes?message+'，可继续下载':message});
  }finally{clearTimeout(idleTimer);}
 }
 cancelDownload(){
  const active=this.transfer;
  if(!active||active.committing)return;
  active.cancelled=true;active.controller.abort();
 }
 suspendDownload(){
  const active=this.transfer;
  if(!active)return;
  if(!active.committing)active.controller.abort(suspended);
  return active.promise;
 }
 async verifiedInstaller(){
  if(!['downloaded','installing'].includes(this.state.status)||!this.downloaded)throw Error('尚无已校验完成的安装包');
  const file=this.downloaded.file,stat=await fs.stat(file);
  if(stat.size!==this.downloaded.size||await fileDigest(file)!==this.downloaded.sha256.toLowerCase())throw Error('安装包完整性校验失败，请重新下载');
  return file;
 }
 markInstalling(){return this.setState('installing',{message:'正在关闭软件并安装更新…'});}
 cancelInstall(){return this.setState('downloaded',{message:'已取消退出；更新包保留，可稍后安装'});}
}
module.exports={UpdateService,compareVersions,INSTALLER,createElectronFetch,createUpdateFetch};
