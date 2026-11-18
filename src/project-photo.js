import {snapshotReference} from './reference-skin-state.js';
import {History} from './model.js';
import {normalizeEffectState} from './ai-effect-stack.js';
import {normalizePerspective} from './public-perspective.js';
import {normalizeLiquify} from './public-liquify.js';
import {packBackground} from './public-background.js';

// 使用旧程序会拒绝的新格式，避免其忽略 AI 图像或取色蒙版后重新保存而丢失数据。
export function projectFormatVersion(photos){
 if(photos.some(p=>p.skyMask||p.history?.items.some(s=>s.skyMask)))return 10;
 const hasBackgroundLight=p=>p.background?.light>0;
 if(photos.some(p=>hasBackgroundLight(p)||p.history?.items.some(hasBackgroundLight)))return 9;
 if(photos.some(p=>p.background||p.history?.items.some(s=>s.background)))return 8;
 if(photos.some(p=>p.subjectMask||p.history?.items.some(s=>s.subjectMask)))return 7;
 if(photos.some(p=>p.liquify?.length||p.history?.items.some(s=>s.liquify?.length)))return 6;
 if(photos.some(p=>p.perspective||p.history?.items.some(s=>s.perspective)))return 5;
 const publicEyes=p=>p.brightEyeFaces?.some(f=>f.format==='guangyu-public-bright-eye-face');
 if(photos.some(p=>publicEyes(p)||p.history?.items.some(publicEyes)))return 4;
 const hasReference=p=>p.skinReference?.maskCrop||p.effects?.stages.some(s=>s.kind==='reference');
 if(photos.some(p=>hasReference(p)||p.history?.items.some(hasReference)))return 3;
 return photos.some(p=>p.effects||p.history?.items.some(s=>s.effects))?2:1;
}

// 保存时取独立参考图快照，保留原有工程字段。
export function projectPhotoRecord(p){
 const assets=[];
 const record={name:p.name,original:p.original,params:{...p.params},skinMask:p.skin.toDataURL(),teethMask:p.teeth.toDataURL(),
  nativeTeethFaces:p.nativeTeethFaces,brightEyeFaces:p.brightEyeFaces,aiMask:p.ai.toDataURL(),aiPoints:p.aiPoints,
  skinReference:snapshotReference(p.skinReference),...(p.effects?{effects:normalizeEffectState(p.effects)}:{})};
 if(p.perspective)record.perspective=normalizePerspective(p.perspective);
 if(p.liquify?.length)record.liquify=normalizeLiquify(p.liquify);
 if(p.subjectMask)record.subjectMask=p.subjectMask.toDataURL();
 if(p.background)record.background=packBackground(p.background,assets);
 if(p.skyMask)record.skyMask=p.skyMask.toDataURL();
 if(p.sky)record.sky=packBackground(p.sky,assets);
 if(p.history){
  // 保存边界包含尚未触发 change 的实时状态；不改动工作台的撤销分支。
  const history=new History(null);history.items=p.history.items.slice();history.index=p.history.index;
  history.push({params:record.params,skin:record.skinMask,teeth:record.teethMask,ai:record.aiMask,aiPoints:record.aiPoints,nativeTeethFaces:record.nativeTeethFaces,brightEyeFaces:record.brightEyeFaces,skinReference:record.skinReference,...(record.effects?{effects:record.effects}:{}),...(record.perspective?{perspective:record.perspective}:{}),...(record.liquify?.length?{liquify:record.liquify}:{}),...(record.subjectMask?{subjectMask:record.subjectMask}:{}),...(p.background?{background:p.background}:{}),...(record.skyMask?{skyMask:record.skyMask}:{}),...(p.sky?{sky:p.sky}:{})});
  history.items=history.items.map(item=>({...item,...(item.background?{background:packBackground(item.background,assets)}:{}),...(item.sky?{sky:packBackground(item.sky,assets)}:{})}));
  record.history=history.toRecord();
 }
 if(assets.length)record.backgroundAssets=assets;
 return record;
}

// factory负责照片解码；参考图数据在异步恢复前取得独立副本。
export function restoreProjectPhoto(p,makePhoto){
 const reference=snapshotReference(p.skinReference);
 const history=p.history?History.fromRecord(p.history):null;
 const extra=p.skyMask?[normalizeEffectState(p.effects),p.subjectMask??null,p.background??null,p.skyMask,p.sky??null]
  :p.subjectMask?[normalizeEffectState(p.effects),p.subjectMask]:p.effects?[normalizeEffectState(p.effects)]:[];
 if(p.background&&!p.skyMask)extra.push(p.background);
 return Promise.resolve(makePhoto(p.name,p.original,p.params,p.skinMask,p.teethMask,p.aiMask,p.aiPoints,p.nativeTeethFaces,p.brightEyeFaces,reference,...extra)).then(photo=>{
  if(p.perspective)photo.perspective=normalizePerspective(p.perspective);
  if(p.liquify?.length)photo.liquify=normalizeLiquify(p.liquify);
  if(!history&&(photo.perspective||photo.liquify?.length))photo.history.push({
   ...photo.history.current,...(photo.perspective?{perspective:photo.perspective}:{}),...(photo.liquify?.length?{liquify:photo.liquify}:{}),
  });
  if(history)photo.history=history;return photo;
 });
}
