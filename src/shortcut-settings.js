import {SHORTCUT_ACTIONS,DEFAULT_SHORTCUTS,shortcutFromEvent,shortcutLabel,assignShortcut,readShortcuts,writeShortcuts,findShortcutAction} from './shortcuts.js';

// 将快捷键接到已有按钮，沿用按钮本身的禁用状态和处理流程。
export function installShortcutSettings({document,storage,canRun,beforeRun,onZoom,notify}){
 const byId=id=>document.getElementById(id);
 let bindings=readShortcuts(storage),draft={...bindings},recording=null;
 const entry=document.createElement('button');entry.id='shortcut-settings';entry.type='button';entry.className='secondary';entry.textContent='快捷键设置';entry.title='自定义功能快捷键';
 document.querySelector('.topbar nav').prepend(entry);
 const dialog=document.createElement('dialog');dialog.id='shortcut-dialog';dialog.className='shortcut-dialog';dialog.setAttribute('aria-labelledby','shortcut-title');
 dialog.innerHTML='<div class="shortcut-heading"><div><h2 id="shortcut-title">自定义快捷键</h2><p>点击设置后按下新组合。一个组合只能分配给一个功能。</p></div><button type="button" id="shortcut-close" aria-label="关闭快捷键设置">×</button></div><input id="shortcut-search" type="search" placeholder="搜索功能" aria-label="搜索快捷键功能"><p id="shortcut-message" role="status" aria-live="polite">设置只保存在本机；重启后继续生效。</p><div id="shortcut-list" class="shortcut-list"></div><div class="shortcut-footer"><button type="button" id="shortcut-defaults">恢复默认</button><span></span><button type="button" id="shortcut-cancel">取消</button><button type="button" id="shortcut-save" class="primary">保存</button></div>';
 document.body.append(dialog);
 const list=byId('shortcut-list'),search=byId('shortcut-search'),message=byId('shortcut-message');

 function refreshHints(){
  for(const action of SHORTCUT_ACTIONS){
   const button=byId(action.id);if(!button)continue;
   if(!button.dataset.shortcutTitle)button.dataset.shortcutTitle=action.label;
   button.title=button.dataset.shortcutTitle+(bindings[action.id]?' · '+shortcutLabel(bindings[action.id]):'');
  }
  const footer=document.querySelector('.controls-footer');
  if(footer)footer.textContent=['brush','eraser','compare'].filter(id=>bindings[id]).map(id=>`${shortcutLabel(bindings[id])} ${SHORTCUT_ACTIONS.find(a=>a.id===id).label}`).join(' · ')||'可在右上角设置快捷键';
 }

 function renderRows(){
  const scroll=list.scrollTop,filter=search.value.trim().toLowerCase();list.replaceChildren();let group='';
  const visible=SHORTCUT_ACTIONS.filter(action=>(action.label+action.group).toLowerCase().includes(filter));
  const groups=[...new Set(SHORTCUT_ACTIONS.map(action=>action.group))];visible.sort((a,b)=>groups.indexOf(a.group)-groups.indexOf(b.group));
  for(const action of visible){
   if(action.group!==group){group=action.group;const heading=document.createElement('h3');heading.textContent=group;list.append(heading);}
   const row=document.createElement('div');row.className='shortcut-row';row.dataset.action=action.id;
   const label=document.createElement('span');label.textContent=action.label;
   const record=document.createElement('button');record.type='button';record.className='shortcut-record';record.classList.toggle('recording',recording===action.id);
   record.textContent=recording===action.id?'请按新组合…':shortcutLabel(draft[action.id]);record.setAttribute('aria-label','设置'+action.label+'快捷键');
   record.onclick=()=>{recording=action.id;message.textContent='请按下快捷键；Esc 取消本次录入。';renderRows();list.querySelector(`[data-action="${action.id}"] .shortcut-record`)?.focus();};
   const clear=document.createElement('button');clear.type='button';clear.className='shortcut-clear';clear.textContent='清除';clear.disabled=!draft[action.id];clear.setAttribute('aria-label','清除'+action.label+'快捷键');
   clear.onclick=()=>{draft=assignShortcut(draft,action.id,'');recording=null;renderRows();message.textContent='已清除，点击保存生效。';};
   row.append(label,record,clear);list.append(row);
  }
  if(!visible.length){const empty=document.createElement('p');empty.textContent='没有找到匹配的功能';list.append(empty);}
  list.scrollTop=scroll;
 }

 entry.onclick=()=>{draft={...bindings};recording=null;search.value='';message.textContent='设置只保存在本机；重启后继续生效。';renderRows();dialog.showModal();search.focus();};
 for(const id of ['shortcut-close','shortcut-cancel'])byId(id).onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{recording=null;});
 search.oninput=()=>{recording=null;renderRows();};
 byId('shortcut-defaults').onclick=()=>{draft={...DEFAULT_SHORTCUTS};recording=null;renderRows();message.textContent='已恢复默认，点击保存生效。';};
 byId('shortcut-save').onclick=()=>{
  try{writeShortcuts(storage,draft);bindings={...draft};recording=null;refreshHints();dialog.close();notify('快捷键已保存');}
  catch(error){message.textContent='未能保存：'+error.message;}
 };

 document.addEventListener('keydown',event=>{
  if(dialog.open){
   if(!recording)return;
   event.preventDefault();event.stopImmediatePropagation();
   if(event.key==='Escape'){recording=null;renderRows();message.textContent='已取消本次录入';return;}
   const shortcut=shortcutFromEvent(event);
   if(!shortcut){message.textContent='请使用字母、数字或功能键，可组合 Ctrl、Alt、Shift；系统组合无法使用。';return;}
   try{draft=assignShortcut(draft,recording,shortcut);recording=null;renderRows();message.textContent='已录入，点击保存生效。';}
   catch(error){message.textContent=error.message;}
   return;
  }
  const action=findShortcutAction(event,bindings);if(!action)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!canRun()||event.repeat&&!['zoom-in','zoom-out'].includes(action))return;
  beforeRun();
  if(action.startsWith('zoom-')){onZoom(action.slice(5));return;}
  const spec=SHORTCUT_ACTIONS.find(item=>item.id===action);
  if(spec?.panel){byId(spec.panel)?.scrollIntoView({block:'start',behavior:'instant'});return;}
  const button=byId(action);if(button&&!button.disabled)button.click();
 },true);
 refreshHints();
 return {dialog};
}
