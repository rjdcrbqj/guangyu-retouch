import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceHistory} from '../src/workspace-history.js';

test('全局撤销先回到上一张照片，再整组撤销同步；重做顺序相反',async()=>{
 const history=new WorkspaceHistory();let selection=0,values=[.25,0,0];
 const apply=async(entry,direction)=>{if(entry.selection)selection=entry.selection[direction];if(entry.values)values=[...entry.values[direction]];};
 const sync={label:'同步设置',values:{before:[.25,0,0],after:[.25,.25,.25]}};values=[...sync.values.after];history.record(sync);
 selection=2;history.record({label:'选择切换',selection:{before:0,after:2}});
 assert.equal(await history.undo(apply),'选择切换');assert.equal(selection,0);assert.deepEqual(values,[.25,.25,.25]);
 assert.equal(await history.undo(apply),'同步设置');assert.deepEqual(values,[.25,0,0]);
 await history.redo(apply);assert.deepEqual(values,[.25,.25,.25]);await history.redo(apply);assert.equal(selection,2);
});
test('失败和并发恢复不移动历史位置；新编辑清除重做分支',async()=>{
 const history=new WorkspaceHistory();history.record({label:'A'});history.record({label:'B'});
 await assert.rejects(history.undo(async()=>{throw Error('decode failed');}),/decode/);assert.equal(history.canRedo,false);
 let release;const pending=history.undo(()=>new Promise(resolve=>{release=resolve;}));
 assert.equal(history.canUndo,false);assert.equal(await history.undo(()=>assert.fail('duplicate')),null);
 release();await pending;assert.equal(history.canRedo,true);history.record({label:'C'});assert.equal(history.canRedo,false);
 history.clear();assert.equal(history.canUndo,false);
});
test('限制全局历史长度，不保留已淘汰的操作',async()=>{
 const h=new WorkspaceHistory(2);for(const label of ['A','B','C'])h.record({label});const labels=[];
 while(h.canUndo)await h.undo(async e=>labels.push(e.label));assert.deepEqual(labels,['C','B']);
});
