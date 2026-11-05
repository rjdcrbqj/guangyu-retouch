// 快捷键定义、冲突检查及本机保存；不接触照片和修图参数。
const commands=[
 ['import','导入照片','文件'],['open-project','打开工程','文件'],['save-project','保存工程','文件'],['export','导出当前照片','文件'],['batch-export','批量导出','文件'],
 ['undo','撤销','编辑'],['redo','重做','编辑'],['global-undo','全局撤销','编辑'],['global-redo','全局重做','编辑'],['compare','前后对比','查看'],['zoom-in','放大图片','查看'],['zoom-out','缩小图片','查看'],['zoom-fit','适应窗口','查看'],['zoom-100','100% 原尺寸','查看'],
 ['brush','画笔','工具'],['eraser','橡皮','工具'],['hand','浏览拖动','工具'],['face-skin','框脸选皮肤','工具'],['native','原模型选区','工具'],['clear-mask','清除当前涂选','工具'],
 ['skin-tab','切换皮肤选区','工具'],['ai-tab','切换 AI 局部选区','工具'],['teeth-tab','切换牙齿选区','工具'],
 ['auto-skin','自动识别皮肤','修图功能'],['auto-hair','自动识别头发','修图功能'],['auto-region','识别当前五官分区','修图功能'],
 ['portrait-repair','应用净肤','修图功能'],['wrinkle-repair','应用祛皱','修图功能'],['lip-wrinkle-repair','应用淡化唇纹','修图功能'],['eye-bag-repair','应用去眼袋','修图功能'],['dark-circles-repair','应用祛黑眼圈','修图功能'],['skin-unify-repair','应用肤色统一','修图功能'],['bright-eye-identify','识别亮眼区域','修图功能'],
 ['reference-pick','参考取色','修图功能'],['reference-apply','应用参考肤色','修图功能'],['reference-clear','清除参考图','修图功能'],['reset','重置当前照片','编辑'],['sync-params','同步参数到勾选照片','编辑'],['mark-all','勾选全部照片','文件'],['mark-none','取消勾选照片','文件'],
];
const panels=[['basic-controls','调色'],['hsl-section','HSL'],['native-color-section','色温'],['portrait-repair-section','AI净肤'],['wrinkle-section','AI祛皱'],['lip-wrinkle-section','唇纹'],['skin-unify-section','肤色统一'],['eye-bag-section','去眼袋'],['dark-circles-section','祛黑眼圈'],['bright-eye-section','亮眼'],['vignette-section','暗角'],['finishing-section','细节'],['local-section','局部'],['workflow-section','批量与预设'],['output-section','导出设置']];
export const SHORTCUT_ACTIONS=Object.freeze([...commands.map(([id,label,group])=>Object.freeze({id,label,group})),...panels.map(([panel,label])=>Object.freeze({id:'panel:'+panel,label:'打开'+label+'面板',group:'功能面板',panel}))]);
const ids=new Set(SHORTCUT_ACTIONS.map(action=>action.id));
export const DEFAULT_SHORTCUTS=Object.freeze({...Object.fromEntries(SHORTCUT_ACTIONS.map(action=>[action.id,''])),import:'Ctrl+KeyO','save-project':'Ctrl+KeyS',undo:'Ctrl+KeyZ',redo:'Ctrl+Shift+KeyZ','global-undo':'Ctrl+Alt+KeyZ','global-redo':'Ctrl+Alt+Shift+KeyZ',brush:'KeyB',eraser:'KeyE',hand:'KeyH',compare:'KeyC','zoom-in':'Ctrl+Equal','zoom-out':'Ctrl+Minus','zoom-fit':'Digit0','zoom-100':'Digit1'});
const storageKey='guangyu.shortcuts.v1';
const allowedCode=/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Equal|Minus|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|PageUp|PageDown|Home|End|Space)$/;

// 用实体按键记录组合；加号与等号共用放大键，避免要求额外输入 Shift。
export function shortcutFromEvent(event){
 if(event.isComposing||event.keyCode===229||event.metaKey||event.getModifierState?.('AltGraph'))return null;
 let code=event.code;if(code==='NumpadAdd')code='Equal';if(code==='NumpadSubtract')code='Minus';
 if(!allowedCode.test(code??''))return null;
 const parts=[];if(event.ctrlKey)parts.push('Ctrl');if(event.altKey)parts.push('Alt');if(event.shiftKey&&code!=='Equal')parts.push('Shift');parts.push(code);
 const value=parts.join('+');
 if(event.altKey&&code==='F4'||event.ctrlKey&&['KeyW','KeyR','F4'].includes(code))return null;
 return value;
}

function validShortcut(value){
 if(value==='')return true;
 if(typeof value!=='string')return false;
 const parts=value.split('+'),code=parts.pop();
 return shortcutFromEvent({code,ctrlKey:parts.includes('Ctrl'),altKey:parts.includes('Alt'),shiftKey:parts.includes('Shift')})===value;
}

// 返回新配置；冲突时不修改用户原有绑定。
export function assignShortcut(bindings,id,value){
 if(!ids.has(id))throw Error('没有找到这个功能');
 if(!validShortcut(value))throw Error('该组合由系统或窗口使用，请换一个快捷键');
 const conflict=SHORTCUT_ACTIONS.find(action=>action.id!==id&&value&&bindings[action.id]===value);
 if(conflict)throw Error(`快捷键已用于“${conflict.label}”，请先清除该绑定`);
 return {...bindings,[id]:value};
}

export function readShortcuts(storage){
 try{
  const saved=JSON.parse(storage.getItem(storageKey));
  if(saved?.version!==1||!saved.bindings||typeof saved.bindings!=='object')return {...DEFAULT_SHORTCUTS};
  const result={...DEFAULT_SHORTCUTS},used=new Set();
  for(const action of SHORTCUT_ACTIONS.filter(a=>Object.hasOwn(saved.bindings,a.id))){
   const value=saved.bindings[action.id];
   if(!validShortcut(value)||value&&used.has(value))throw Error('快捷键记录无效');
   result[action.id]=value;if(value)used.add(value);
  }
  // 新增功能不抢占用户旧版本绑定；冲突的新默认组合暂留空。
  for(const action of SHORTCUT_ACTIONS.filter(a=>!Object.hasOwn(saved.bindings,a.id))){
   const value=result[action.id];if(value&&used.has(value))result[action.id]='';else if(value)used.add(value);
  }
  return result;
 }catch{return {...DEFAULT_SHORTCUTS};}
}

export function writeShortcuts(storage,bindings){
 const used=new Set();for(const action of SHORTCUT_ACTIONS){const value=bindings[action.id];if(!validShortcut(value)||value&&used.has(value))throw Error('快捷键存在冲突');if(value)used.add(value);}
 storage.setItem(storageKey,JSON.stringify({version:1,bindings}));
}

export function findShortcutAction(event,bindings){
 const target=event.target;
 if((target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName))&&!event.ctrlKey&&!event.altKey&&!event.metaKey)return null;
 const shortcut=shortcutFromEvent(event);if(!shortcut)return null;
 return SHORTCUT_ACTIONS.find(action=>bindings[action.id]===shortcut)?.id??null;
}

export function shortcutLabel(value){
 if(!value)return '未设置';
 const labels={Equal:'+',Minus:'−',Digit0:'0',Digit1:'1',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backquote:'`',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Space:'空格'};
 return value.split('+').map(part=>labels[part]??part.replace(/^Key|^Digit/,'')).join(' + ');
}
