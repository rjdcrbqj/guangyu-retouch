const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {UpdateService,compareVersions}=require('../updates.cjs');

async function fixture(t,{version='0.8.1',corrupt=false}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'guangyu-updater-test-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const data=Buffer.from('MZ'+('offline-installer-data'.repeat(500)));
 const root=`https://github.com/rjdcrbqj/guangyu-retouch/releases/download/v${version}/`;
 const manifest={version,installer:'GuangyuRetouchSetup.exe',size:data.length,sha256:corrupt?'0'.repeat(64):createHash('sha256').update(data).digest('hex')};
 const release={tag_name:'v'+version,html_url:`https://github.com/rjdcrbqj/guangyu-retouch/releases/tag/v${version}`,body:'新增测试功能',draft:false,prerelease:false,assets:[{name:'update.json',state:'uploaded',size:250,browser_download_url:root+'update.json'},{name:manifest.installer,state:'uploaded',size:data.length,browser_download_url:root+manifest.installer}]};
 const requested=[];
 const fetchImpl=async(url)=>{requested.push(String(url));if(String(url).includes('api.github.com'))return new Response(JSON.stringify(release));if(String(url).endsWith('update.json'))return new Response(JSON.stringify(manifest));return new Response(data);};
 const service=new UpdateService({repository:'rjdcrbqj/guangyu-retouch',currentVersion:'0.8.0',downloadDir:directory,fetchImpl});
 return {service,requested,directory,data,release,manifest};
}
test('版本按数字比较，拒绝不支持的标签',()=>{
 assert.equal(compareVersions('0.10.0','0.9.9'),1);
 assert.equal(compareVersions('v0.8.0','0.8.0'),0);
 assert.throws(()=>compareVersions('0.8.1-beta','0.8.0'));
});
test('检查新版不会下载或安装；显式下载后才产生已校验安装包',async t=>{
 const f=await fixture(t);const state=await f.service.check();assert.equal(state.status,'available');
 assert.equal(f.requested.length,2);assert.equal(f.requested.some(url=>url.endsWith('.exe')),false);
 await assert.rejects(f.service.verifiedInstaller());
 assert.equal((await f.service.download()).status,'downloaded');
 assert.deepEqual(await fs.readFile(await f.service.verifiedInstaller()),f.data);
 await f.service.download();assert.equal(f.requested.filter(url=>url.endsWith('.exe')).length,1);
});
test('已经是最新版本时不取更新清单',async t=>{
 const f=await fixture(t,{version:'0.7.3'});assert.equal((await f.service.check()).status,'current');assert.equal(f.requested.length,1);
});
test('校验失败与下载后被修改的文件不能安装',async t=>{
 const bad=await fixture(t,{corrupt:true});await bad.service.check();assert.equal((await bad.service.download()).status,'error');await assert.rejects(bad.service.verifiedInstaller());
 const good=await fixture(t);await good.service.check();await good.service.download();const file=await good.service.verifiedInstaller();await fs.writeFile(file,'changed');await assert.rejects(good.service.verifiedInstaller(),/校验|完整/);
});
test('更新链接必须来自指定仓库，清单不能改名或跳转到其他网站',async t=>{
 const f=await fixture(t);f.release.assets[0].browser_download_url='https://example.com/update.json';assert.equal((await f.service.check()).status,'error');assert.equal(f.requested.length,1);
});
test('用户取消下载后没有可安装的半成品',async t=>{
 const f=await fixture(t);await f.service.check();
 f.service.fetchImpl=async(_url,{signal})=>new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(new DOMException('Canceled','AbortError')),{once:true});}}));
 const promise=f.service.download();f.service.cancelDownload();assert.equal((await promise).status,'available');await assert.rejects(f.service.verifiedInstaller());
 assert.equal((await fs.readdir(f.directory)).filter(name=>name.endsWith('.part')).length,0);
});
