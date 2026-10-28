'use strict';
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createReadStream,createWriteStream}=require('node:fs');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const INSTALLER='GuangyuRetouchSetup.exe';
const allowedHosts=new Set(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com']);

function versionParts(value){
 const match=/^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(value);
 if(!match)throw Error('版本号格式无效');return match.slice(1).map(Number);
}
function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
function validateUrl(value){const url=new URL(value);if(url.protocol!=='https:'||!allowedHosts.has(url.hostname)||url.username||url.password||url.port)throw Error('更新地址不属于可信的 GitHub 下载服务');return url;}
async function fileDigest(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}

// 只从固定公开仓库读取更新；客户端不保存 GitHub 登录凭据。
class UpdateService extends EventEmitter{
 constructor({repository,currentVersion,downloadDir,fetchImpl=globalThis.fetch}){
  super();if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw Error('更新仓库格式无效');versionParts(currentVersion);
  this.repository=repository;this.currentVersion=currentVersion;this.downloadDir=downloadDir;this.fetchImpl=fetchImpl;
  this.state={status:'idle',currentVersion,message:'可手动检查更新'};this.available=null;this.controller=null;this.checkPromise=null;
 }
 snapshot(){return {...this.state};}
 setState(status,extra={}){this.state={...this.state,status,...extra};this.emit('state',this.snapshot());return this.snapshot();}
 async response(url,{signal}={}){
  let next=String(url);
  for(let i=0;i<=5;i++){
   validateUrl(next);const response=await this.fetchImpl(next,{redirect:'manual',signal,headers:{'User-Agent':'GuangyuRetouch/'+this.currentVersion,Accept:'application/vnd.github+json'}});
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
  if(['downloading','downloaded','installing'].includes(this.state.status))return this.snapshot();
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
   return this.setState('available',{latestVersion:version,notes:String(release.body??'').slice(0,30000),releaseUrl:`https://github.com/${this.repository}/releases/tag/${release.tag_name}`,totalBytes:manifest.size,downloadedBytes:0,percent:0,message:'发现新版本 '+version});
  }catch(error){return this.setState(error.status===404?'current':'error',{message:error.message??'检查更新失败，请稍后重试'});}
 }
 async download(){
  if(['downloaded','downloading','installing'].includes(this.state.status))return this.snapshot();
  if(!this.available)throw Error('请先检查更新');
  const update={...this.available};this.controller=new AbortController();const controller=this.controller;
  const part=path.join(this.downloadDir,INSTALLER+'.part'),file=path.join(this.downloadDir,INSTALLER);
  this.setState('downloading',{percent:0,downloadedBytes:0,message:'正在下载更新…'});
  let idleTimer;const resetTimeout=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>controller.abort(new Error('下载连接超时，请重试')),45000);};
  try{
   await fs.mkdir(this.downloadDir,{recursive:true});resetTimeout();
   const response=await this.response(update.url,{signal:controller.signal});
   let downloaded=0,lastProgress=0;const hash=createHash('sha256');
   const progress=new Transform({transform:(chunk,_encoding,done)=>{
    downloaded+=chunk.length;resetTimeout();if(downloaded>update.size)return done(Error('安装包大小与更新信息不一致'));
    hash.update(chunk);if(Date.now()-lastProgress>250){lastProgress=Date.now();this.setState('downloading',{downloadedBytes:downloaded,percent:Math.floor(downloaded/update.size*100)});}done(null,chunk);
   }});
   await pipeline(Readable.fromWeb(response.body),progress,createWriteStream(part),{signal:controller.signal});
   if(downloaded!==update.size||hash.digest('hex')!==update.sha256.toLowerCase())throw Error('安装包完整性校验失败，请重新下载');
   await fs.rename(part,file);this.downloaded={...update,file};
   return this.setState('downloaded',{downloadedBytes:downloaded,percent:100,message:'下载完成，可选择安装并重启'});
  }catch(error){
   await fs.rm(part,{force:true}).catch(()=>{});
   return this.setState(controller.signal.aborted?'available':'error',{message:controller.signal.aborted?(controller.signal.reason?.message==='下载连接超时，请重试'?'下载连接超时，请重试':'已取消下载'):error.message,downloadedBytes:0,percent:0});
  }finally{clearTimeout(idleTimer);this.controller=null;}
 }
 cancelDownload(){this.controller?.abort();}
 async verifiedInstaller(){
  if(!['downloaded','installing'].includes(this.state.status)||!this.downloaded)throw Error('尚无已校验完成的安装包');
  const file=this.downloaded.file,stat=await fs.stat(file);
  if(stat.size!==this.downloaded.size||await fileDigest(file)!==this.downloaded.sha256.toLowerCase())throw Error('安装包完整性校验失败，请重新下载');
  return file;
 }
 markInstalling(){return this.setState('installing',{message:'正在关闭软件并安装更新…'});}
 cancelInstall(){return this.setState('downloaded',{message:'已取消退出；更新包保留，可稍后安装'});}
}
module.exports={UpdateService,compareVersions,INSTALLER};
