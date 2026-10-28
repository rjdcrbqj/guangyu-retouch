import {snapshotReference} from './reference-skin-state.js';

// 保存时取独立参考图快照，保留原有工程字段。
export function projectPhotoRecord(p){
 return {name:p.name,original:p.original,params:p.params,skinMask:p.skin.toDataURL(),teethMask:p.teeth.toDataURL(),
  nativeTeethFaces:p.nativeTeethFaces,brightEyeFaces:p.brightEyeFaces,aiMask:p.ai.toDataURL(),aiPoints:p.aiPoints,
  skinReference:snapshotReference(p.skinReference)};
}

// factory负责照片解码；参考图数据在异步恢复前取得独立副本。
export function restoreProjectPhoto(p,makePhoto){
 const reference=snapshotReference(p.skinReference);
 return makePhoto(p.name,p.original,p.params,p.skinMask,p.teethMask,p.aiMask,p.aiPoints,p.nativeTeethFaces,p.brightEyeFaces,reference);
}
