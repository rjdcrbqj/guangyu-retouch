import test from 'node:test';
import assert from 'node:assert/strict';
import {shortcutFromEvent,assignShortcut,readShortcuts,writeShortcuts,findShortcutAction,DEFAULT_SHORTCUTS} from '../src/shortcuts.js';

const key=(code,extra={})=>({code,key:code.replace(/^Key/,''),ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,...extra});

test('录入组合、加号和中文输入状态',()=>{
 assert.equal(shortcutFromEvent(key('KeyK',{ctrlKey:true,altKey:true})), 'Ctrl+Alt+KeyK');
 assert.equal(shortcutFromEvent(key('Equal',{ctrlKey:true,shiftKey:true,key:'+'})), 'Ctrl+Equal');
 assert.equal(shortcutFromEvent(key('ControlLeft',{ctrlKey:true})),null);
 assert.equal(shortcutFromEvent(key('KeyB',{isComposing:true})),null);
 assert.equal(shortcutFromEvent(key('F4',{altKey:true})),null);
});

test('修改绑定会检查冲突，清除后才可重新分配',()=>{
 const initial={...DEFAULT_SHORTCUTS};
 assert.throws(()=>assignShortcut(initial,'compare','KeyB'),/画笔/);
 const cleared=assignShortcut(initial,'brush','');
 const changed=assignShortcut(cleared,'compare','KeyB');
 assert.equal(changed.compare,'KeyB');assert.equal(changed.brush,'');
 assert.equal(initial.brush,'KeyB');
 assert.throws(()=>assignShortcut(initial,'compare','Alt+F4'),/系统|窗口/);
});

test('保存后可恢复自定义和已清除的快捷键；损坏记录回默认',()=>{
 const memory=new Map();const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const changed=assignShortcut(assignShortcut({...DEFAULT_SHORTCUTS},'brush',''),'compare','Ctrl+KeyK');
 writeShortcuts(storage,changed);
 assert.deepEqual(readShortcuts(storage),changed);
 storage.setItem('guangyu.shortcuts.v1','{broken');assert.deepEqual(readShortcuts(storage),DEFAULT_SHORTCUTS);
});

test('输入框不触发单键，中文输入不触发，改绑后旧组合失效',()=>{
 const bindings=assignShortcut({...DEFAULT_SHORTCUTS},'compare','Ctrl+KeyK');
 assert.equal(findShortcutAction(key('KeyC'),bindings),null);
 assert.equal(findShortcutAction(key('KeyK',{ctrlKey:true}),bindings),'compare');
 assert.equal(findShortcutAction(key('KeyB',{target:{tagName:'INPUT'}}),bindings),null);
 assert.equal(findShortcutAction(key('KeyB',{target:{isContentEditable:true}}),bindings),null);
 assert.equal(findShortcutAction(key('KeyS',{ctrlKey:true,target:{tagName:'INPUT'}}),bindings),'save-project');
 assert.equal(findShortcutAction(key('KeyK',{ctrlKey:true,isComposing:true}),bindings),null);
});
