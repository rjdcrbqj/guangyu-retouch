// 全局历史保存操作事务；图像恢复成功后才移动游标，避免失败丢失撤销机会。
export class WorkspaceHistory {
 constructor(limit=30){this.limit=limit;this.clear();}
 clear(){this.entries=[];this.index=0;this.pending=false;}
 get canUndo(){return !this.pending&&this.index>0;}
 get canRedo(){return !this.pending&&this.index<this.entries.length;}
 record(entry){
  if(this.pending)throw Error('正在恢复历史，请稍候');
  this.entries.splice(this.index);this.entries.push(entry);
  if(this.entries.length>this.limit)this.entries.shift();this.index=this.entries.length;
 }
 async move(direction,apply){
  const undo=direction==='before';if(!(undo?this.canUndo:this.canRedo))return null;
  const entry=this.entries[this.index-(undo?1:0)];this.pending=true;
  try{await apply(entry,direction);this.index+=undo?-1:1;return entry.label;}
  finally{this.pending=false;}
 }
 undo(apply){return this.move('before',apply);}
 redo(apply){return this.move('after',apply);}
}
