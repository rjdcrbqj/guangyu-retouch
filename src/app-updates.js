// 更新提醒只负责显示；下载与安装必须由用户点击确认。
export function installAppUpdates({document,desktop,notify}){
 if(!desktop?.updateStatus)return;
 const button=document.createElement('button');button.id='check-updates';button.type='button';button.textContent='检查更新';button.title='查看版本与更新';
 document.querySelector('.topbar nav').prepend(button);
 const dialog=document.createElement('dialog');dialog.id='update-dialog';dialog.className='shortcut-dialog update-dialog';dialog.setAttribute('aria-labelledby','update-title');
 dialog.innerHTML='<div class="shortcut-heading"><div><h2 id="update-title">软件更新</h2><p id="update-version"></p></div><button type="button" id="update-close" aria-label="关闭更新窗口">×</button></div><p id="update-message" role="status" aria-live="polite"></p><progress id="update-progress" max="100" hidden></progress><pre id="update-notes"></pre><p class="hint">更新不会替换照片或重置快捷键。安装前请保存当前工程。</p><div class="shortcut-footer"><button type="button" id="update-check">重新检查</button><span></span><button type="button" id="update-later">稍后</button><button type="button" id="update-cancel-download" hidden>取消下载</button><button type="button" id="update-download-full" hidden>下载完整包</button><button type="button" id="update-download" class="primary" hidden>下载更新</button><button type="button" id="update-install" class="primary" hidden>安装并重启</button></div>';
 document.body.append(dialog);const element=id=>document.getElementById(id);let state={status:'idle'},seen=new Set();
 function open(){if(!dialog.open)dialog.showModal();}
 function sizeLabel(bytes){
  return bytes<1048576?`${Math.round(bytes/1024)} KB`:`${Math.round(bytes/1048576)} MB`;
 }
 function render(next){
  state=next;button.textContent=['available','downloaded'].includes(state.status)?'有新版本':'检查更新';button.classList.toggle('update-available',['available','downloaded'].includes(state.status));
  element('update-version').textContent=`当前版本 ${state.currentVersion??''}${state.latestVersion?' · 最新版本 '+state.latestVersion:''}`;
  element('update-message').textContent=state.message??'';element('update-notes').textContent=state.notes??'';
  const canDownload=state.status==='available'||state.status==='error'&&state.latestVersion;
  const canResume=canDownload&&state.downloadedBytes>0;
  element('update-progress').hidden=state.status!=='downloading'&&!canResume;element('update-progress').value=state.percent??0;
  if(state.status==='downloading'&&state.downloadedBytes>0){
   const kind=state.updateKind==='incremental'?'增量包':'完整包';
   element('update-message').textContent=`正在下载${kind} ${state.percent??0}% · ${sizeLabel(state.downloadedBytes)} / ${sizeLabel(state.totalBytes)}`;
  }
  element('update-download').hidden=!canDownload;
  element('update-download').textContent=canResume?'继续下载':state.updateKind==='incremental'?`下载增量包（${sizeLabel(state.totalBytes)}）`:'下载更新';
  element('update-download-full').hidden=state.updateKind!=='incremental'||(!canDownload&&state.status!=='downloaded');
  element('update-install').hidden=state.status!=='downloaded';element('update-cancel-download').hidden=state.status!=='downloading';
  element('update-check').disabled=['checking','downloading','verifying','installing','downloaded'].includes(state.status);
  element('update-install').disabled=state.status==='installing';
  if(state.status==='available'&&!seen.has(state.latestVersion)){seen.add(state.latestVersion);open();}
  if(state.status==='downloaded'){open();notify('新版本已下载，是否安装由你决定');}
 }
 async function action(callback){try{const result=await callback();if(result)render(result);}catch(error){element('update-message').textContent=error.message??'更新操作未完成，请重试';}}
 button.onclick=()=>{open();action(async()=>{const current=await desktop.updateStatus();render(current);return ['idle','current','error'].includes(current.status)?desktop.checkUpdates():current;});};
 element('update-check').onclick=()=>action(()=>desktop.checkUpdates());
 element('update-download').onclick=()=>action(()=>desktop.downloadUpdate());
 element('update-download-full').onclick=()=>action(()=>desktop.downloadUpdate({forceFull:true}));
 element('update-install').onclick=()=>action(()=>desktop.installUpdate());
 element('update-cancel-download').onclick=()=>action(()=>desktop.cancelUpdate());
 for(const id of ['update-close','update-later'])element(id).onclick=()=>dialog.close();
 desktop.onUpdateState(render);desktop.updateStatus().then(render).catch(()=>{});
 if(desktop.appInfo)desktop.appInfo().then(info=>{if(!info.examplesAvailable)element('load-examples').hidden=true;}).catch(()=>{});
}
