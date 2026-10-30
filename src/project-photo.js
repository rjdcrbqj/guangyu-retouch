import {snapshotReference} from './reference-skin-state.js';
import {History} from './model.js';

// 保存时取独立参考图快照，保留原有工程字段。
export function projectPhotoRecord(p){
 const record={name:p.name,original:p.original,params:{...p.params},skinMask:p.skin.toDataURL(),teethMask:p.teeth.toDataURL(),
  nativeTeethFaces:p.nativeTeethFaces,brightEyeFaces:p.brightEyeFaces,aiMask:p.ai.toDataURL(),aiPoints:p.aiPoints,
  skinReference:snapshotReference(p.skinReference)};
 if(p.history){
  // 保存边界包含尚未触发 change 的实时状态；不改动工作台的撤销分支。
  const history=new History(null);history.items=p.history.items.slice();history.index=p.history.index;
  history.push({params:record.params,skin:record.skinMask,teeth:record.teethMask,ai:record.aiMask,aiPoints:record.aiPoints,nativeTeethFaces:record.nativeTeethFaces,brightEyeFaces:record.brightEyeFaces,skinReference:record.skinReference});
  record.history=history.toRecord();
 }
 return record;
}

// factory负责照片解码；参考图数据在异步恢复前取得独立副本。
export function restoreProjectPhoto(p,makePhoto){
 const reference=snapshotReference(p.skinReference);
 const history=p.history?History.fromRecord(p.history):null;
 return Promise.resolve(makePhoto(p.name,p.original,p.params,p.skinMask,p.teethMask,p.aiMask,p.aiPoints,p.nativeTeethFaces,p.brightEyeFaces,reference)).then(photo=>{
  if(history)photo.history=history;return photo;
 });
}
