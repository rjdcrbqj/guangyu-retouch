import {validateBrightEyeFaces} from './bright-eye-parameters.js';
import {validateNativeTeethFaces} from './teeth-v3-parameters.js';
import {BULK_SPECS} from './bulk-params.js';
import {wrinkleRegions,wrinkleOptionsFromParams} from './recovered-wrinkle-regions.js';
import {traceMaskContours} from './selection-contours.js';
import { DEFAULTS,normalizeParams,History,validateProject,combineSoftMasks } from './model.js';
import { PhotoEngine } from './engine.js';
import {normalizeReferenceState,snapshotReference,replaceReference,clearReference} from './reference-skin-state.js';
import {cropReferencePatch,cropReferenceMaskRaw,requireFullReferencePatch} from './reference-pick.js';
import {buildReferenceJobRequest} from './reference-job.js';
import {restoreReferenceSupplies} from './reference-restore.js';
import {makeWorkingPixelsReader} from './reference-memory.js';
import {encodeReferencePNG64} from './reference-png.js';
import {projectPhotoRecord,restoreProjectPhoto} from './project-photo.js';
import {PARAM_GROUPS,syncParams,createPreset,validatePreset,serializePreset,planExportNames} from './workflow.js';

const $=id=>document.getElementById(id);
const canvas=$('preview'),overlay=$('overlay'),wrap=$('image-wrap'),viewport=$('viewport');
let engine,photos=[],selected=-1,activeMask='skin',tool='brush',compare=false,busy=false,dirty=false,painting=false,lastPoint=null,frame=0,toastTimer,referencePicking=false;
let marked=new Set(),batchCanceled=false;
let faceDrag=null,contourCache=null,dashPhase=0;
try{engine=new PhotoEngine(canvas);}catch(error){notify(error.message);}
const definitions=[['exposure','曝光',-2,2,.05,'basic-controls'],['contrast','对比度',-50,50,1,'basic-controls'],['saturation','饱和度',-50,50,1,'basic-controls'],['warmth','色温',-50,50,1,'basic-controls'],['skinSmooth','柔化',0,100,1,'skin-controls'],['skinBright','皮肤提亮',0,100,1,'skin-controls'],['teethBright','简易去黄与提亮',0,100,1,'teeth-controls'],['localExposure','局部曝光',-2,2,.05,'ai-controls']];
definitions.push(['sharpAmount','锐化强度（%）',0,300,5,'advanced-controls'],['sharpRadius','锐化半径（原图像素）',1,12,1,'advanced-controls'],['vibrance','自然饱和度',-100,100,1,'advanced-controls'],['nativeContrast','精细对比度',-100,100,1,'advanced-controls'],['contrastPivot','对比中心',0,100,1,'advanced-controls'],['localVibrance','局部自然饱和度',-100,100,1,'ai-controls'],['localContrast','局部精细对比度',-100,100,1,'ai-controls'],['localContrastPivot','局部对比中心',0,100,1,'ai-controls']);
// Group related tools in collapsible sections; sticky navigation keeps every module reachable.
const detailGroups=[['texture','颗粒与去噪',['medianDenoise','grayNoise','grayNoiseDark','colorNoise','colorNoiseDark']],['softness','柔化与反锐化',['desharpen','desharpenRadius']],['pixel','像素化',['pixelate','pixelateBlocks']],['blur','运动、径向与旋转模糊',['motionBlur','motionAngle','radialBlur','rotateBlur','blurCenterX','blurCenterY','blurProtectRadius']],['dispersion','色散',['dispersion','dispersionAngle']]];
for(const [id,label] of detailGroups){const d=document.createElement('details');d.className='effect-group';d.open=id==='texture';const title=document.createElement('summary');title.textContent=label;const content=document.createElement('div');content.id='detail-'+id;d.append(title,content);$('finishing-controls').append(d);}
const nativeEffectToggles=['hslEnabled','tempTintEnabled','nativeTeethEnabled'];
for(const [i,label] of ['红','橙','黄','绿','青','蓝','紫','洋红'].entries()){const details=document.createElement('details');details.className='effect-group';details.open=i===0;const title=document.createElement('summary');title.textContent=label;const content=document.createElement('div');content.id='hsl-color-'+i;details.append(title,content);$('hsl-controls').append(details);}
for(const spec of BULK_SPECS){if(['finishingScope','wrinkleMode','wrinkleStrength'].includes(spec.key)||nativeEffectToggles.includes(spec.key))continue;const detail=detailGroups.find(g=>g[2].includes(spec.key));definitions.push([spec.key,spec.label,spec.min,spec.max,spec.step,spec.group==='wrinkle'?'wrinkle-region-controls':spec.group==='wrinkle'?'wrinkle-region-controls':spec.key==='skinUnifyStrength'?'skin-unify-controls':spec.key==='lipWrinkleStrength'?'lip-wrinkle-controls':spec.key==='darkCirclesStrength'?'dark-circles-controls':spec.key.startsWith('eyeBag')?'eye-bag-controls':spec.key.startsWith('brightEye')?'bright-eye-'+(spec.key.includes('Left')?'left':'right')+'-controls':spec.key.startsWith('nativeTeeth')?'native-teeth-controls':spec.key.startsWith('hsl')?'hsl-color-'+spec.key.slice(-1):['relativeTemperature','relativeTint'].includes(spec.key)?'temp-tint-controls':spec.key.startsWith('vignette')?'vignette-controls':detail?'detail-'+detail[0]:spec.group==='basic'?'style-controls':'ai-controls']);}
for(const button of document.querySelectorAll('[data-jump]'))button.onclick=()=>$(button.dataset.jump).scrollIntoView({block:'start',behavior:'instant'});
$('finishingScope').onchange=()=>{const p=current();if(!p||busy)return;p.params.finishingScope=Number($('finishingScope').value);commit();queueRender();};
for(const [id,label,min,max,step,parent] of definitions){
 const row=document.createElement('div');row.className='slider-row';
 row.innerHTML=`<label class="slider-label" for="${id}"><span>${label}</span><output id="${id}-value">0</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="0" disabled>`;
 $(parent).append(row);$(id).addEventListener('input',()=>{const p=current();if(!p||busy)return;p.params[id]=Number($(id).value);updateValues();queueRender();});
 $(id).addEventListener('change',commit);$(id).addEventListener('dblclick',()=>{const p=current();if(!p||busy)return;p.params[id]=DEFAULTS[id];commit();updateValues();queueRender();});
}
for(const id of nativeEffectToggles)$(id).onchange=()=>{const p=current();if(!p||busy)return;p.params[id]=Number($(id).checked);commit();queueRender();};
const readWorkingPixels=makeWorkingPixelsReader(document);
function current(){return photos[selected];}
function status(text){$('status').textContent=text;}
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);status(text);}
function setBusy(value,message){busy=value;if(message)status(message);updateUI();}
function markDirty(){dirty=true;document.title='光屿修图 · 未保存';}
function snapshot(p){return {params:{...p.params},skin:p.skin.toDataURL(),teeth:p.teeth.toDataURL(),ai:p.ai.toDataURL(),aiPoints:p.aiPoints,nativeTeethFaces:p.nativeTeethFaces,brightEyeFaces:p.brightEyeFaces,skinReference:snapshotReference(p.skinReference)};}
function commit(){const p=current();if(!p||busy)return;p.history.push(snapshot(p));p.edited=true;markDirty();updateUI();updateLibrary();}
function updateValues(){
 const wp=current()?.params??DEFAULTS;
 $('skin-unify-repair').disabled=!current()||busy||!engine||!window.desktop?.skinUnifyRepair||!wp.skinUnifyStrength;
 $('wrinkleMode').value=String(wp.wrinkleMode);$('wrinkle-strength').value=String(wp.wrinkleStrength);$('wrinkle-strength-value').textContent=String(wp.wrinkleStrength);
 $('wrinkle-overall-controls').hidden=wp.wrinkleMode===1;$('wrinkle-region-controls').hidden=wp.wrinkleMode!==1;
 for(const id of nativeEffectToggles)$(id).checked=Boolean(current()?.params[id]);$('finishingScope').value=String(current()?.params.finishingScope??0);
 for(const [id] of definitions){const n=current()?.params[id]??0;$(id).value=n;$(id+'-value').textContent=['exposure','localExposure'].includes(id)?`${n>0?'+':''}${n.toFixed(2)}`:String(n);}
}
function updateUI(){
 document.querySelectorAll('.photo-mark input').forEach(el=>el.disabled=busy);
 const p=current(),enabled=Boolean(p)&&!busy&&Boolean(engine);
 for(const id of [...nativeEffectToggles,'finishingScope','export','save-project','reset','compare','clear-mask',...definitions.map(x=>x[0])])$(id).disabled=!enabled;
 $('native').disabled=!enabled||!p?.native?.available;
 $('bright-eye-identify').disabled=!enabled||!window.desktop?.brightEye;
 for(const id of ['eye-bag-repair','eyeBagStrength','eyeBagKeep'])$(id).disabled=!enabled||!window.desktop?.eyeBagRepair;
 for(const id of ['dark-circles-repair','darkCirclesStrength'])$(id).disabled=!enabled||!window.desktop?.darkCirclesRepair;
 $('skinUnifyStrength').disabled=!enabled||!window.desktop?.skinUnifyRepair;
 for(const id of ['lip-wrinkle-repair','lipWrinkleStrength'])$(id).disabled=!enabled||!window.desktop?.lipWrinkleRepair;
 $('bright-eye-status').textContent=p?.brightEyeFaces?.length?`已识别 ${p.brightEyeFaces.length} 张脸，分别增加左右眼整体强度后生效。`:'先识别眼睛，再增加整体强度；支持每张照片最多8张脸。';
 $('face-skin').disabled=!enabled||!window.desktop?.faceSkin;
 for(const id of ['portrait-repair','repair-blemish','repair-acne','repair-freckle','repair-nevi'])$(id).disabled=!enabled||!window.desktop?.portraitRepair;
 for(const id of ['wrinkle-repair','wrinkle-strength','wrinkleMode',...wrinkleRegions.map(r=>r.key)])$(id).disabled=!enabled||!window.desktop?.wrinkleRepair;
 for(const id of ['auto-skin','auto-hair','auto-region','facial-region','view-skin','view-ai','selection-mode','show-face-boxes'])$(id).disabled=!enabled||!window.desktop?.autoPortrait;
 $('import-feature').disabled=!enabled||!window.desktop?.nativeImportFeature;
 $('native-status').textContent=p?.native?.reason??'六张示例可直接试用；新照片需导入匹配的原生特征。';
 for(const id of ['positive-point','negative-point','restart-selection'])$(id).disabled=!enabled||!p?.native?.available;
 for(const id of ['import','add-more','empty-import','open-project','load-examples'])$(id).disabled=busy;
 for(const id of ['mark-all','mark-none'])$(id).disabled=busy||!photos.length;
 for(const id of ['save-preset','load-preset'])$(id).disabled=!enabled;
 $('sync-params').disabled=!enabled||![...marked].some(photo=>photo!==p);
 $('batch-export').disabled=busy||!engine||!marked.size||!window.desktop?.batchBegin;
 $('marked-count').textContent=`已勾选 ${marked.size} 张`;
 $('undo').disabled=!enabled||!p.history.canUndo;$('redo').disabled=!enabled||!p.history.canRedo;
 $('empty-state').hidden=Boolean(p);wrap.hidden=!p;$('photo-count').textContent=`${photos.length} 张`;
 $('file-name').textContent=p?.name??'尚未选择照片';$('dimensions').textContent=p?`${p.img.naturalWidth} × ${p.img.naturalHeight}  ·  原图保留`:'导入照片，开始调整';
 $('compare').classList.toggle('active',compare);$('compare-line').hidden=!compare||!p;$('compare-control').hidden=!compare||!p;
 $('preview-label').textContent=p?`预览 ${canvas.width} × ${canvas.height}`:'等待导入';updateMaskStatus();updateValues();
}
function updateLibrary(){
 $('photo-list').replaceChildren();photos.forEach((p,i)=>{
  const b=document.createElement('div');b.className='photo-item'+(i===selected?' active':'');b.dataset.index=i;b.title=p.name;b.tabIndex=0;b.setAttribute('role','button');
  const mark=document.createElement('label');mark.className='photo-mark';const check=document.createElement('input');check.type='checkbox';check.checked=marked.has(p);check.disabled=busy;check.setAttribute('aria-label','勾选 '+p.name);mark.append(check);mark.addEventListener('click',e=>e.stopPropagation());check.onchange=()=>{check.checked?marked.add(p):marked.delete(p);updateUI();};
  const img=document.createElement('img');img.src=p.thumbnail;img.alt=p.name;
  const caption=document.createElement('span');caption.className='photo-caption';const name=document.createElement('b');name.textContent=p.name;caption.append(name);
  const state=document.createElement('span');state.className=p.edited?'edited':'';state.textContent=p.edited?'':String(i+1).padStart(2,'0');caption.append(state);
  b.append(img,caption,mark);b.addEventListener('click',()=>{if(!busy)select(i);});b.addEventListener('keydown',e=>{if(e.target===b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(!busy)select(i);}});$('photo-list').append(b);
 });
}
function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error(`无法读取 ${file.name}`));reader.readAsDataURL(file);});}
function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('图片无法解码，请使用完整的 JPG、PNG 或 WebP 文件。'));image.src=url;});}
function maskCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
async function makePhoto(name,original,params=DEFAULTS,skinMask,teethMask,aiMask,aiPoints=[],nativeTeethFaces=[],brightEyeFaces=[],skinReference=null){
 const reference=snapshotReference(skinReference);
 const img=await loadImage(original);if(img.naturalWidth*img.naturalHeight>80000000)throw new Error(`${name} 超过本版支持的8000万像素，请先缩小图片。`);
 const ratio=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.max(1,Math.round(img.naturalWidth*ratio)),h=Math.max(1,Math.round(img.naturalHeight*ratio));
 const skin=maskCanvas(w,h),teeth=maskCanvas(w,h),ai=maskCanvas(w,h);if(aiMask)ai.getContext('2d').drawImage(await loadImage(aiMask),0,0,w,h);if(skinMask)skin.getContext('2d').drawImage(await loadImage(skinMask),0,0,w,h);if(teethMask)teeth.getContext('2d').drawImage(await loadImage(teethMask),0,0,w,h);
 const thumb=maskCanvas(140,Math.max(1,Math.round(h/w*140)));thumb.getContext('2d').drawImage(img,0,0,thumb.width,thumb.height);
 // 取色/作业需要整数像素帧；与mask同用工作分辨率(w,h)，避免与选区尺寸不一致。
 const referencePixels=(()=>{const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
  return new Uint8Array(ctx.getImageData(0,0,w,h).data);})();
 const native=window.desktop?.nativeInspect?await window.desktop.nativeInspect(original).catch(e=>({available:false,reason:'原模型资源不可用：'+e.message})):{available:false,reason:'原模型选区仅在桌面版中可用。'};
 // 工程重开后：已保存的64×64参考图可还原为通道可用的编码BYTE；
 // 但参考蒙版裁切块无法反推，保持null，用户需重新取色才能再次应用（不伪造）。
 let restoredReference=null,restoredCrop=null;
 try{
  const refNorm=normalizeReferenceState(reference);
  restoredReference=restoreReferenceSupplies(refNorm);
  // 派生照片也应能再次应用参考：用已绘制的皮肤选区与保存的取点，按同一裁切规则重建裁切块。
  if(refNorm?.image&&Array.isArray(refNorm.pickPoint)){
   const mw=skin.width,mh=skin.height,[rx,ry]=refNorm.pickPoint;
   if(rx<mw&&ry<mh){
    const sd=skin.getContext('2d').getImageData(0,0,mw,mh);
    const al=new Uint8Array(mw*mh);for(let i=0;i<mw*mh;i++)al[i]=sd.data[i*4+3];
    const cr=cropReferenceMaskRaw({data:al,width:mw,height:mh,stride:mw,point:[rx,ry]});
    restoredCrop={data:cr.data,width:cr.width,height:cr.height,stride:cr.stride};
   }
  }
 }catch{restoredReference=null;restoredCrop=null;}
 const p={name,original,img,skin,teeth,ai,aiPoints,referencePNGSupply:restoredReference?.referencePNGSupply??null,referenceMaskCrop:restoredCrop,skinReference:normalizeReferenceState(reference),brightEyeFaces:validateBrightEyeFaces(brightEyeFaces,{sourceWH:[img.naturalWidth,img.naturalHeight]}),nativeTeethFaces:validateNativeTeethFaces(nativeTeethFaces,{sourceWH:[img.naturalWidth,img.naturalHeight]}),native,params:normalizeParams(params),thumbnail:thumb.toDataURL('image/jpeg',.75),edited:!!skinMask};p.history=new History(snapshot(p));return p;
}
async function importFiles(files){
 if(busy||!engine)return;const list=[...files];if(!list.length)return;setBusy(true,'正在导入照片…');let added=0;const failures=[];
 try{for(const f of list){try{if(!/^image\/(jpeg|png|webp)$/.test(f.type))throw new Error(`${f.name}：仅支持 JPG、PNG、WebP`);if(f.size>60*1024*1024)throw new Error(`${f.name}：文件超过60MB`);photos.push(await makePhoto(f.name,await readFile(f)));added++;}catch(e){failures.push(e.message);}}if(added){if(selected<0)select(0);markDirty();updateLibrary();}}
 finally{setBusy(false);$('files').value='';}
 if(failures.length)notify(`导入 ${added} 张；${failures.join('；')}`);else status(`已导入 ${added} 张照片，选择局部后可进行精修。`);
}
for(const id of ['repair-blemish','repair-acne','repair-freckle'])$(id).oninput=()=>{$(id+'-value').textContent=$(id).value;};
$('portrait-repair').onclick=async()=>{
 const p=current();if(!p||busy||!window.desktop?.portraitRepair)return;
 const strengths={blemish:Number($('repair-blemish').value)/100,acne:Number($('repair-acne').value)/100,freckle:Number($('repair-freckle').value)/100,removeNevi:$('repair-nevi').checked};
 if(!strengths.blemish&&!strengths.acne&&!strengths.freckle&&!strengths.removeNevi){notify('请先增加一项净肤强度');return;}
 setBusy(true,'正在识别人脸并生成净肤副本…');$('repair-status').textContent='正在处理，请稍候…';
 try{
  const result=await window.desktop.portraitRepair({original:p.original,strengths});
  if(!result.processedFaces){$('repair-status').textContent='没有找到可处理的人脸，请换用更清晰的人像照片。';status($('repair-status').textContent);return;}
  const stem=p.name.replace(/\.[^.]+$/,'');let name=stem+'-净肤.png',n=2;while(photos.some(x=>x.name===name))name=`${stem}-净肤-${n++}.png`;
  const derived=await makePhoto(name,'data:image/png;base64,'+result.png,p.params,p.skin.toDataURL(),p.teeth.toDataURL(),p.ai.toDataURL(),p.aiPoints,p.nativeTeethFaces,[],p.skinReference);
  photos.push(derived);select(photos.length-1);markDirty();updateLibrary();
  const remaining=Math.max(0,result.detectedFaces-result.processedFaces);
  const message=`已生成净肤副本 · 处理 ${result.processedFaces} 张脸${remaining?`，另有 ${remaining} 张脸未处理（每次最多8张）`:''} · 原照片保留在照片库`;$('repair-status').textContent=message;status(message);
 }catch(error){$('repair-status').textContent='净肤未完成：'+error.message;notify($('repair-status').textContent);}finally{setBusy(false);}
};
$('bright-eye-identify').onclick=async()=>{
 const p=current();if(!p||busy||!window.desktop?.brightEye)return;
 setBusy(true,'正在识别眼睛…');
 try{const result=await window.desktop.brightEye({original:p.original});const faces=validateBrightEyeFaces(result.faces,{sourceWH:[p.img.naturalWidth,p.img.naturalHeight]});p.brightEyeFaces=faces;setBusy(false);commit();render();notify(faces.length?`已识别 ${faces.length} 张脸的眼睛，请增加左右眼整体强度。`:'没有找到可处理的眼睛，请换用更清晰的人像照片。');}
 catch(error){notify('眼睛识别未完成：'+error.message);}finally{setBusy(false);}
};
$('eye-bag-repair').onclick=async()=>{
 const p=current();if(!p||busy||!window.desktop?.eyeBagRepair)return;
 if(!p.params.eyeBagStrength){notify('请先增加去眼袋强度');return;}
 setBusy(true,'正在识别人脸并生成去眼袋副本…');$('eye-bag-status').textContent='正在处理，请稍候…';
 try{
  const result=await window.desktop.eyeBagRepair({original:p.original,primaryPercent:p.params.eyeBagStrength,secondaryPercent:p.params.eyeBagKeep});
  if(!result.processedFaces){$('eye-bag-status').textContent='没有找到可处理的人脸，请换用更清晰的人像照片。';status($('eye-bag-status').textContent);return;}
  const stem=p.name.replace(/\.[^.]+$/,'');let name=stem+'-去眼袋.png',n=2;while(photos.some(x=>x.name===name)){name=stem+'-去眼袋-'+n+'.png';n++;}
  const derived=await makePhoto(name,'data:image/png;base64,'+result.png,p.params,p.skin.toDataURL(),p.teeth.toDataURL(),p.ai.toDataURL(),p.aiPoints,[],[],p.skinReference);
  photos.push(derived);select(photos.length-1);markDirty();updateLibrary();
  const remaining=Math.max(0,result.detectedFaces-result.processedFaces);
  const message='已生成去眼袋副本 · 处理 '+result.processedFaces+' 张脸'+(remaining?'，另有 '+remaining+' 张脸未处理（每次最多8张）':'')+' · 原照片保留在照片库';
  $('eye-bag-status').textContent=message;status(message);
 }catch(error){$('eye-bag-status').textContent='去眼袋未完成：'+error.message;notify($('eye-bag-status').textContent);}finally{setBusy(false);}
};
$('dark-circles-repair').onclick=async()=>{
 const p=current();if(!p||busy||!window.desktop?.darkCirclesRepair)return;
 if(!p.params.darkCirclesStrength){notify('请先增加祛黑眼圈强度');return;}
 setBusy(true,'正在识别人脸并生成祛黑眼圈副本…');$('dark-circles-status').textContent='正在处理，请稍候…';
 try{
  const result=await window.desktop.darkCirclesRepair({original:p.original,strengthPercent:p.params.darkCirclesStrength});
  if(!result.processedFaces){$('dark-circles-status').textContent='没有找到可处理的眼区，请换用更清晰的人像照片。';status($('dark-circles-status').textContent);return;}
  const stem=p.name.replace(/\.[^.]+$/,'');let name=stem+'-祛黑眼圈.png',n=2;while(photos.some(x=>x.name===name)){name=stem+'-祛黑眼圈-'+n+'.png';n++;}
  const derived=await makePhoto(name,'data:image/png;base64,'+result.png,p.params,p.skin.toDataURL(),p.teeth.toDataURL(),p.ai.toDataURL(),p.aiPoints,[],[],p.skinReference);
  photos.push(derived);select(photos.length-1);markDirty();updateLibrary();
  const remaining=Math.max(0,result.detectedFaces-result.processedFaces);
  const message='已生成祛黑眼圈副本 · 处理 '+result.processedFaces+' 张脸'+(remaining?'，另有 '+remaining+' 张脸未处理（每次最多8张）':'')+' · 原照片保留在照片库';
  $('dark-circles-status').textContent=message;status(message);
 }catch(error){$('dark-circles-status').textContent='祛黑眼圈未完成：'+error.message;notify($('dark-circles-status').textContent);}finally{setBusy(false);}
};
$('lip-wrinkle-repair').onclick=async()=>{
 const p=current();if(!p||busy||!window.desktop?.lipWrinkleRepair)return;
 if(!p.params.lipWrinkleStrength){notify('请先增加唇纹强度');return;}
 setBusy(true,'正在识别人脸并生成淡化唇纹副本…');$('lip-wrinkle-status').textContent='正在处理，请稍候…';
 try{
  const result=await window.desktop.lipWrinkleRepair({original:p.original,strengthPercent:p.params.lipWrinkleStrength});
  if(!result.processedFaces){$('lip-wrinkle-status').textContent='没有找到可处理的人脸，请换用更清晰的人像照片。';status($('lip-wrinkle-status').textContent);return;}
  const stem=p.name.replace(/\.[^.]+$/,'');let name=stem+'-淡化唇纹.png',n=2;while(photos.some(x=>x.name===name))name=`${stem}-淡化唇纹-${n++}.png`;
  const derived=await makePhoto(name,'data:image/png;base64,'+result.png,p.params,p.skin.toDataURL(),p.teeth.toDataURL(),p.ai.toDataURL(),p.aiPoints,p.nativeTeethFaces,p.brightEyeFaces,p.skinReference);
  photos.push(derived);select(photos.length-1);markDirty();updateLibrary();
  const remaining=Math.max(0,result.detectedFaces-result.processedFaces),changed=result.changedRGBFields;
  const message=`已生成淡化唇纹副本 · 处理 ${result.processedFaces} 张脸${remaining?`，另有 ${remaining} 张脸未处理（每次最多8张）`:''}${changed?'':' · 当前强度未产生像素变化'} · 原照片保留在照片库`;
  $('lip-wrinkle-status').textContent=message;status(message);
 }catch(error){$('lip-wrinkle-status').textContent='淡化唇纹未完成：'+error.message;notify($('lip-wrinkle-status').textContent);}finally{setBusy(false);}
};
$('skin-unify-repair').onclick=async()=>{
 const p=current();if(!p||busy||!window.desktop?.skinUnifyRepair)return;
 if(!p.params.skinUnifyStrength){notify('请先增加肤色统一强度');return;}
 setBusy(true,'正在识别人脸并生成肤色统一副本…');$('skin-unify-status').textContent='正在处理，请稍候…';
 try{
  const result=await window.desktop.skinUnifyRepair({original:p.original,strengthPercent:p.params.skinUnifyStrength});
  if(!result.processedFaces){$('skin-unify-status').textContent='没有找到可处理的人脸，请换用更清晰的人像照片。';status($('skin-unify-status').textContent);return;}
  const stem=p.name.replace(/\.[^.]+$/,'');let name=stem+'-肤色统一.png',n=2;while(photos.some(x=>x.name===name))name=`${stem}-肤色统一-${n++}.png`;
  const derived=await makePhoto(name,'data:image/png;base64,'+result.png,{...p.params,skinUnifyStrength:0},p.skin.toDataURL(),p.teeth.toDataURL(),p.ai.toDataURL(),p.aiPoints,p.nativeTeethFaces,p.brightEyeFaces,p.skinReference);
  photos.push(derived);select(photos.length-1);markDirty();updateLibrary();
  const remaining=Math.max(0,result.detectedFaces-result.processedFaces),changed=result.changedRGBFields;
  const message=`已生成肤色统一副本 · 处理 ${result.processedFaces} 张脸${remaining?`，另有 ${remaining} 张脸未处理（每次最多8张）`:''}${changed?'':' · 当前强度未产生像素变化'} · 原照片保留在照片库`;
  $('skin-unify-status').textContent=message;status(message);
 }catch(error){$('skin-unify-status').textContent='肤色统一未完成：'+error.message;notify($('skin-unify-status').textContent);}finally{setBusy(false);}
};
$('wrinkleMode').onchange=()=>{const p=current();if(!p||busy)return;p.params.wrinkleMode=Number($('wrinkleMode').value);commit();updateValues();};
$('wrinkle-strength').oninput=()=>{const p=current();if(!p||busy)return;p.params.wrinkleStrength=Number($('wrinkle-strength').value);$('wrinkle-strength-value').textContent=$('wrinkle-strength').value;};
$('wrinkle-strength').onchange=commit;
$('wrinkle-strength').ondblclick=()=>{const p=current();if(!p||busy)return;p.params.wrinkleStrength=DEFAULTS.wrinkleStrength;commit();updateValues();};
$('wrinkle-repair').onclick=async()=>{
 const p=current();if(!p||busy||!window.desktop?.wrinkleRepair)return;
 const options=wrinkleOptionsFromParams(p.params);if(options.regionsPercent?!Object.values(options.regionsPercent).some(v=>Math.fround(v/100)>Math.fround(.001)):!options.strength){notify(options.regionsPercent?'请先增加至少一个祛皱分区的强度':'请先增加祛皱强度');return;}
 setBusy(true,'正在识别人脸并生成祛皱副本…');$('wrinkle-status').textContent='正在处理，请稍候…';
 try{
  const result=await window.desktop.wrinkleRepair({original:p.original,...options});
  if(!result.processedFaces){$('wrinkle-status').textContent='没有找到可处理的人脸，请换用更清晰的人像照片。';status($('wrinkle-status').textContent);return;}
  const stem=p.name.replace(/\.[^.]+$/,'');let name=stem+'-祛皱.png',n=2;while(photos.some(x=>x.name===name))name=`${stem}-祛皱-${n++}.png`;
  const derived=await makePhoto(name,'data:image/png;base64,'+result.png,p.params,p.skin.toDataURL(),p.teeth.toDataURL(),p.ai.toDataURL(),p.aiPoints,p.nativeTeethFaces,[],p.skinReference);
  photos.push(derived);select(photos.length-1);markDirty();updateLibrary();
  const remaining=Math.max(0,result.detectedFaces-result.processedFaces);
  const message=`已生成祛皱副本 · 处理 ${result.processedFaces} 张脸${remaining?`，另有 ${remaining} 张脸未处理（每次最多8张）`:''} · 原照片保留在照片库`;
  $('wrinkle-status').textContent=message;status(message);
 }catch(error){$('wrinkle-status').textContent='祛皱未完成：'+error.message;notify($('wrinkle-status').textContent);}finally{setBusy(false);}
};
function select(index){
 endStroke();if(referencePicking){referencePicking=false;$('reference-pick').classList.remove('active');}selected=index;const p=current();if(!p)return;if(tool==='native'&&!p.native.available)chooseTool('brush');engine.setImage(p.img);engine.setMasks(p.skin,p.teeth,p.ai,p.nativeTeethFaces);contourCache=null;overlay.width=canvas.width;overlay.height=canvas.height;
 updateUI();updateLibrary();fitImage();render();
}
function fitImage(){
 if(!current())return;const zoom=$('zoom').value;const scale=zoom==='fit'?Math.min((viewport.clientWidth-56)/canvas.width,(viewport.clientHeight-56)/canvas.height,1):Number(zoom)/100;
 wrap.style.width=`${Math.max(1,canvas.width*scale)}px`;wrap.style.height=`${Math.max(1,canvas.height*scale)}px`;
}
function queueRender(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;render();});}
function render(){
 const p=current();if(!p||!engine)return;
 try{engine.setBrightEyeFaces(p.brightEyeFaces);engine.render(p.params,compare?Number($('split').value)/100:-1);drawOverlay();$('compare-line').style.left=$('split').value+'%';}catch(e){notify(e.message);}
}
// 轮廓按当前蒙版缓存；画笔、识别、撤销或换图后重新提取。
function maskOutline(mask){
 if(contourCache?.mask===mask)return contourCache.path;
 const data=mask.getContext('2d').getImageData(0,0,mask.width,mask.height).data,path=new Path2D();
 for(const points of traceMaskContours(data,mask.width,mask.height)){path.moveTo(...points[0]);for(let i=1;i<points.length;i++)path.lineTo(...points[i]);path.closePath();}
 contourCache={mask,path};return path;
}
function drawOverlay(){
 const ctx=overlay.getContext('2d');ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,overlay.width,overlay.height);if(!current())return;
 const mode=$('selection-mode').value,scale=overlay.width/Math.max(1,overlay.getBoundingClientRect().width);
 if(!compare){
  if(mode==='color'){
   ctx.save();ctx.drawImage(current()[activeMask],0,0);ctx.globalCompositeOperation='source-in';ctx.globalAlpha=.58;
   ctx.fillStyle=activeMask==='skin'?'#53b7ff':activeMask==='ai'?'#40e6ad':'#efc58e';ctx.fillRect(0,0,overlay.width,overlay.height);ctx.restore();
  }else if(mode==='outline'){
   const path=maskOutline(current()[activeMask]);ctx.save();ctx.lineWidth=1.5*scale;ctx.lineJoin='round';ctx.strokeStyle='#151515';ctx.stroke(path);
   ctx.setLineDash([5*scale,5*scale]);ctx.lineDashOffset=-dashPhase*scale;ctx.strokeStyle='#fff';ctx.stroke(path);ctx.restore();
  }
  // 人脸框独立开关；所有提示均只在预览层绘制。
  if($('show-face-boxes').checked)for(const [i,box] of (current().detectedFaces??[]).entries()){
   ctx.save();ctx.strokeStyle='#ffda75';ctx.lineWidth=2*scale;ctx.setLineDash([6*scale,4*scale]);ctx.strokeRect(box.x*overlay.width,box.y*overlay.height,box.width*overlay.width,box.height*overlay.height);
   ctx.font=`${12*scale}px "Microsoft YaHei"`;const label=`人脸 ${i+1}`,right=(box.x+box.width)*overlay.width+4*scale,x=right+58*scale<=overlay.width?right:Math.max(0,box.x*overlay.width-62*scale),y=Math.max(18*scale,box.y*overlay.height);ctx.fillStyle='#17222eee';ctx.fillRect(x,y-18*scale,58*scale,18*scale);ctx.fillStyle='#ffda75';ctx.fillText(label,x+4*scale,y-4*scale);ctx.restore();
  }
  if(mode!=='hidden'&&tool==='native'&&activeMask==='ai'){for(const p of current().aiPoints){ctx.beginPath();ctx.arc(p.x*overlay.width,p.y*overlay.height,7,0,Math.PI*2);ctx.fillStyle=p.label?'#69e6bd':'#ff7878';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}}
 }
 if(faceDrag){ctx.save();ctx.strokeStyle='#8ef0ce';ctx.lineWidth=Math.max(2,overlay.width/400);ctx.setLineDash([10,6]);ctx.strokeRect(faceDrag.start.x,faceDrag.start.y,faceDrag.end.x-faceDrag.start.x,faceDrag.end.y-faceDrag.start.y);ctx.restore();}
}
// 蚂蚁线每100毫秒前进一步，复用路径且不重新推理；减少动态效果时保持静止。
setInterval(()=>{if(!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!busy&&!painting&&current()&&!compare&&$('selection-mode').value==='outline'){dashPhase=(dashPhase+1)%10;drawOverlay();}},100);
function updateMaskStatus(){
 const name=activeMask==='ai'?'AI局部':activeMask==='skin'?'皮肤':'牙齿';const p=current();let has=false;
 if(p){const ctx=p[activeMask].getContext('2d');const data=ctx.getImageData(0,0,p[activeMask].width,p[activeMask].height).data;for(let i=3;i<data.length;i+=4)if(data[i]){has=true;break;}}
 $('view-skin').classList.toggle('active',activeMask==='skin');$('view-ai').classList.toggle('active',activeMask==='ai');
 const faceCount=p?.detectedFaces?.length;const faceText=faceCount===undefined?'':faceCount?`检测到 ${faceCount} 张脸 · `:'未检测到人脸 · ';
 $('selection-summary').textContent=!p?'导入照片后可识别选区':faceText+(compare?'对比中，选区暂时隐藏':$('selection-mode').value==='hidden'?'选区显示已关闭':has?`${name}选区 · ${$('selection-mode').value==='outline'?'轮廓线':'彩色覆盖'}`:`${name}尚无选区`);
 $('mask-status').textContent=has?`已涂选${name} · 可调整下方效果`:`尚未涂选${name}`;
 $('stage-hint').textContent=tool==='face-skin'?'框住整张脸后松开，生成皮肤选区 · Esc 取消':tool==='native'?'原模型选区 · 点击添加选区，Shift+点击减去 · 推理后调整局部曝光':tool==='hand'?'浏览模式 · 放大后可拖动画面':`正在涂选${name} · ${tool==='eraser'?'橡皮擦除区域':'画笔添加区域'}`;
}
function chooseMask(value){if(busy)return;endStroke();if((value!=='ai'&&tool==='native')||(value!=='skin'&&tool==='face-skin'))chooseTool('brush');activeMask=value;$('face-skin-panel').hidden=value!=='skin';$('ai-tab').classList.toggle('active',value==='ai');$('ai-controls').hidden=value!=='ai';$('skin-tab').classList.toggle('active',value==='skin');$('teeth-tab').classList.toggle('active',value==='teeth');$('skin-controls').hidden=value!=='skin';$('teeth-controls').hidden=value!=='teeth';$('mask-description').textContent=value==='ai'?'点击选中目标后，用局部曝光调整亮暗。':value==='skin'?'框脸识别或手动涂选皮肤，再调整柔化和提亮。':'涂选牙齿后，再调整去黄与提亮。';updateMaskStatus();drawOverlay();}
function chooseTool(value){if(busy)return;endStroke();if(referencePicking&&value!=='hand'){referencePicking=false;$('reference-pick').classList.remove('active');}if(value==='native'){if(!current()?.native?.available){notify(current()?.native?.reason??'请先导入照片');return;}chooseMask('ai');}if(value==='face-skin'){if(!current()||!window.desktop?.faceSkin)return;chooseMask('skin');compare=false;if($('selection-mode').value==='hidden')$('selection-mode').value='outline';}tool=value;for(const id of ['brush','eraser','hand','native','face-skin'])$(id).classList.toggle('active',value===id);overlay.classList.toggle('painting',value!=='hand');$('brush-cursor').style.display='none';updateMaskStatus();updateUI();drawOverlay();}
function point(event){const r=overlay.getBoundingClientRect();return {x:(event.clientX-r.left)*overlay.width/r.width,y:(event.clientY-r.top)*overlay.height/r.height};}
function cursor(event){if(['hand','native','face-skin'].includes(tool)||!current())return;const r=overlay.getBoundingClientRect();const c=$('brush-cursor');const diameter=Number($('brush-size').value)*r.width/overlay.width;c.style.display='block';c.style.width=c.style.height=`${diameter}px`;c.style.left=`${event.clientX-r.left}px`;c.style.top=`${event.clientY-r.top}px`;}
function stamp(p){
 const ctx=current()[activeMask].getContext('2d'),radius=Number($('brush-size').value)/2;
 ctx.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';const g=ctx.createRadialGradient(p.x,p.y,radius*.35,p.x,p.y,radius);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';
}

let pointLabel=1;
$('import-feature').onclick=()=>{if(!busy&&current())$('feature-file').click();};
$('feature-file').onchange=async event=>{
 const file=event.target.files[0],p=current();if(!file||!p||busy)return;setBusy(true,'正在核验原生特征…');
 try{if(file.size>6*1024*1024)throw new Error('特征包过大（最多6MB）');const state=await window.desktop.nativeImportFeature({original:p.original,text:await file.text()});for(const photo of photos)if(photo===p||photo.native?.sha256===state.sha256)photo.native=state;notify('原生特征已导入并保存到本机，可继续点击选区。');}
 catch(error){notify('特征导入失败：'+error.message);}finally{event.target.value='';setBusy(false);}
};
for(const [id,label] of [['positive-point',1],['negative-point',0]])$(id).onclick=()=>{pointLabel=label;chooseTool('native');$('positive-point').classList.toggle('active',label===1);$('negative-point').classList.toggle('active',label===0);};
$('restart-selection').onclick=()=>{if(busy)return;chooseMask('ai');$('clear-mask').click();chooseTool('native');};
async function inferPoint(event){
 const p=current();if(!p?.native?.available||busy)return;
 const xy=point(event),label=event.shiftKey?0:pointLabel;
 const next=[...p.aiPoints,{x:Math.max(0,Math.min(1,xy.x/overlay.width)),y:Math.max(0,Math.min(1,xy.y/overlay.height)),label}];
  compare=false;setBusy(true,'原模型正在计算选区…');
 try{
  const result=await window.desktop.nativeSegment({original:p.original,points:[{...next[next.length-1],label:1}],width:p.ai.width,height:p.ai.height});
  const image=await loadImage('data:image/png;base64,'+result.mask);const ctx=p.ai.getContext('2d'),incoming=maskCanvas(p.ai.width,p.ai.height);incoming.getContext('2d').drawImage(image,0,0);
  const base=ctx.getImageData(0,0,p.ai.width,p.ai.height),selection=incoming.getContext('2d').getImageData(0,0,p.ai.width,p.ai.height);
  base.data.set(combineSoftMasks(base.data,selection.data,label===0?'subtract':'add'));ctx.putImageData(base,0,0);p.aiPoints=next;
  engine.setMasks(p.skin,p.teeth,p.ai,p.nativeTeethFaces);contourCache=null;setBusy(false);commit();render();
  status(`原模型选区完成 · ${next.length} 次选区操作 · ${result.seconds.toFixed(1)}秒 · 调整局部曝光查看效果`);
 }catch(error){notify('原模型选区失败：'+error.message);}finally{setBusy(false);}
}

let panStart;
function boundedPoint(event){const p=point(event);return {x:Math.max(0,Math.min(overlay.width,p.x)),y:Math.max(0,Math.min(overlay.height,p.y))};}
// 原模型框脸推理只添加皮肤蒙版，沿用现有编辑历史和工程格式。
async function inferFace(box){
 const p=current();if(!p||busy)return;setBusy(true,'原模型正在识别脸部皮肤…');
 try{
  const result=await window.desktop.faceSkin({original:p.original,box,width:p.skin.width,height:p.skin.height});
  const image=await loadImage('data:image/png;base64,'+result.mask),incoming=maskCanvas(p.skin.width,p.skin.height);incoming.getContext('2d').drawImage(image,0,0);
  const ctx=p.skin.getContext('2d'),base=ctx.getImageData(0,0,p.skin.width,p.skin.height),mask=incoming.getContext('2d').getImageData(0,0,p.skin.width,p.skin.height);
  base.data.set(combineSoftMasks(base.data,mask.data,'add'));ctx.putImageData(base,0,0);engine.setMasks(p.skin,p.teeth,p.ai,p.nativeTeethFaces);contourCache=null;
  setBusy(false);commit();chooseTool('brush');render();status(`皮肤选区已添加 · ${result.seconds.toFixed(1)}秒 · 可调整柔化、提亮或用画笔修补`);
 }catch(error){notify('皮肤识别失败：'+error.message);}finally{setBusy(false);drawOverlay();}
}

async function inferPortrait(kind){
 const p=current();if(!p||busy)return;
 const regionName={skin:'皮肤',hair:'头发',lips:'嘴唇',eyebrows:'眉毛',teeth:'牙齿'}[kind];
 if(!regionName)return;const target=kind==='skin'?'skin':kind==='teeth'?'teeth':'ai';chooseMask(target);chooseTool('brush');compare=false;if($('selection-mode').value==='hidden')$('selection-mode').value='outline';render();
 setBusy(true,`原模型正在自动找脸并识别${regionName}…`);
 try{
  const result=await window.desktop.autoPortrait({original:p.original,kind,width:p[target].width,height:p[target].height});
  if(!result.masks.length){p.detectedFaces=result.boxes;notify(kind==='teeth'&&result.boxes.length?'未找到可用牙齿选区，原有选区已保留。闭嘴、遮挡或小脸可用画笔补选。':'未找到可靠人脸，原有选区已保留。可使用框脸识别或画笔。');return;}
  // 全部图片解码成功后一次写入，失败时保留原选区及历史。
  const images=await Promise.all(result.masks.map(mask=>loadImage('data:image/png;base64,'+mask)));
  const ctx=p[target].getContext('2d'),base=ctx.getImageData(0,0,p[target].width,p[target].height);
  const beforeAlphaEmpty=base.data.every((v,i)=>i%4!==3||v===0);
  for(const image of images){const incoming=maskCanvas(p[target].width,p[target].height);incoming.getContext('2d').drawImage(image,0,0);base.data.set(combineSoftMasks(base.data,incoming.getContext('2d').getImageData(0,0,incoming.width,incoming.height).data,'add'));}
  if(kind==='teeth'){const incoming=validateNativeTeethFaces(result.nativeTeethFaces,{sourceWH:[p.img.naturalWidth,p.img.naturalHeight]});const combined=[...p.nativeTeethFaces,...incoming];p.nativeTeethFaces=(incoming.length===result.masks.length&&(beforeAlphaEmpty||p.nativeTeethFaces.length>0)&&combined.length<=12)?combined:[];}
  ctx.putImageData(base,0,0);p.detectedFaces=result.boxes;if(target==='ai')p.aiPoints=[];engine.setMasks(p.skin,p.teeth,p.ai,p.nativeTeethFaces);contourCache=null;setBusy(false);commit();render();
  status(`已识别 ${result.boxes.length} 张脸${result.total>12?'（本次处理置信度最高的 12 张）':''} · ${kind==='skin'?'皮肤选区已添加，可调整柔化和提亮':kind==='teeth'?`牙齿选区已添加 · ${result.masks.length} 张脸有可用选区，可调整牙齿提亮或用橡皮修补`:`${regionName}选区已加入 AI局部${kind==='hair'?'，帽子可能误选':''}，可用橡皮修补`} · ${result.seconds.toFixed(1)}秒`);
 }catch(error){notify('自动选区失败：'+error.message);}finally{setBusy(false);drawOverlay();}
}
$('auto-skin').onclick=()=>inferPortrait('skin');$('auto-hair').onclick=()=>inferPortrait('hair');$('auto-region').onclick=()=>inferPortrait($('facial-region').value);
overlay.addEventListener('pointerdown',e=>{if(!current()||busy||e.button!==0)return;if(referencePicking){pickReference(point(e));return;}if(tool==='native'){inferPoint(e);return;}overlay.setPointerCapture(e.pointerId);painting=true;if(tool==='face-skin'){faceDrag={start:boundedPoint(e),end:boundedPoint(e)};drawOverlay();return;}if(tool==='hand'){panStart={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};return;}compare=false;if(activeMask==='ai')current().aiPoints=[];updateUI();if(activeMask==='teeth')current().nativeTeethFaces=[];lastPoint=point(e);stamp(lastPoint);engine.setMasks(current().skin,current().teeth,current().ai,current().nativeTeethFaces);contourCache=null;queueRender();});
overlay.addEventListener('pointermove',e=>{cursor(e);if(!painting)return;if(tool==='face-skin'){faceDrag.end=boundedPoint(e);drawOverlay();return;}if(tool==='hand'){viewport.scrollLeft=panStart.left+panStart.x-e.clientX;viewport.scrollTop=panStart.top+panStart.y-e.clientY;return;}const p=point(e);const dist=Math.hypot(p.x-lastPoint.x,p.y-lastPoint.y);const steps=Math.max(1,Math.ceil(dist/Math.max(1,Number($('brush-size').value)/8)));for(let i=1;i<=steps;i++)stamp({x:lastPoint.x+(p.x-lastPoint.x)*i/steps,y:lastPoint.y+(p.y-lastPoint.y)*i/steps});lastPoint=p;engine.setMasks(current().skin,current().teeth,current().ai,current().nativeTeethFaces);contourCache=null;queueRender();});
function endStroke(event){if(!painting)return;painting=false;if(tool==='face-skin'){const drag=faceDrag;faceDrag=null;drawOverlay();if(event?.type==='pointerup'&&drag){const w=Math.abs(drag.end.x-drag.start.x),h=Math.abs(drag.end.y-drag.start.y);if(w<12||h<12){notify('请拖动框住整张脸，框选范围太小。');return;}inferFace({x:Math.min(drag.start.x,drag.end.x)/overlay.width,y:Math.min(drag.start.y,drag.end.y)/overlay.height,width:w/overlay.width,height:h/overlay.height});}return;}if(tool!=='hand')commit();}
overlay.addEventListener('pointerup',endStroke);overlay.addEventListener('pointercancel',endStroke);overlay.addEventListener('lostpointercapture',endStroke);overlay.addEventListener('pointerleave',()=>$('brush-cursor').style.display='none');
async function restore(state){
 const p=current();setBusy(true);try{const [a,b,c]=await Promise.all([loadImage(state.skin),loadImage(state.teeth),loadImage(state.ai)]);p.aiPoints=state.aiPoints??[];p.nativeTeethFaces=state.nativeTeethFaces??[];p.brightEyeFaces=state.brightEyeFaces??[];p.skinReference=normalizeReferenceState(state.skinReference);p.params=state.params;
  for(const [key,img] of [['skin',a],['teeth',b],['ai',c]]){const ctx=p[key].getContext('2d');ctx.clearRect(0,0,p[key].width,p[key].height);ctx.drawImage(img,0,0);}
  // 重开/撤销后恢复参考供给：编码BYTE（通道必需）与蒙版裁切块。
  // 必须在皮肤选区**已绘制**之后读取裁切块，否则拿到空选区。
  p.referencePNGSupply=null;p.referenceMaskCrop=null;
  try{
   const ref=p.skinReference;
   const restored=restoreReferenceSupplies(ref);
   if(restored)p.referencePNGSupply=restored.referencePNGSupply;
   if(ref?.image&&Array.isArray(ref.pickPoint)){
    const mw=p.skin.width,mh=p.skin.height;
    const [rx,ry]=ref.pickPoint;
    if(rx<mw&&ry<mh){
     const sd=p.skin.getContext('2d').getImageData(0,0,mw,mh);
     const al=new Uint8Array(mw*mh);for(let i=0;i<mw*mh;i++)al[i]=sd.data[i*4+3];
     const crop=cropReferenceMaskRaw({data:al,width:mw,height:mh,stride:mw,point:[rx,ry]});
     p.referenceMaskCrop={data:crop.data,width:crop.width,height:crop.height,stride:crop.stride};
    }
   }
  }catch{}
  engine.setMasks(p.skin,p.teeth,p.ai,p.nativeTeethFaces);contourCache=null;markDirty();render();}finally{setBusy(false);}
}
$('undo').onclick=()=>{const p=current();if(p&&!busy&&p.history.canUndo)restore(p.history.undo());};$('redo').onclick=()=>{const p=current();if(p&&!busy&&p.history.canRedo)restore(p.history.redo());};
$('clear-mask').onclick=()=>{const p=current();if(!p||busy)return;if(activeMask==='ai')p.aiPoints=[];if(activeMask==='teeth')p.nativeTeethFaces=[];p[activeMask].getContext('2d').clearRect(0,0,p[activeMask].width,p[activeMask].height);engine.setMasks(p.skin,p.teeth,p.ai,p.nativeTeethFaces);contourCache=null;commit();render();};
$('reset').onclick=()=>{const p=current();if(!p||busy)return;p.params={...DEFAULTS};p.aiPoints=[];p.nativeTeethFaces=[];p.brightEyeFaces=[];for(const key of ['skin','teeth','ai'])p[key].getContext('2d').clearRect(0,0,p[key].width,p[key].height);engine.setMasks(p.skin,p.teeth,p.ai,p.nativeTeethFaces);contourCache=null;commit();render();};
for(const id of ['import','add-more','empty-import'])$(id).onclick=()=>$('files').click();$('files').onchange=e=>importFiles(e.target.files);
// 参考取色：把当前照片与当前皮肤选区裁剪成64参考图/参考蒙版，写入参考状态。
// 蒙版来自产品自身选区，是调用方供给的手工选区，不是原版M6，也不冒充原版服务结果。
async function pickReference(point){
 const p=current();if(!p||busy)return;
 try{
  // 工作分辨率即mask/像素帧分辨率；overlay坐标 -> 该分辨率整数点。
  const overlayW=overlay.width,overlayH=overlay.height;
  const w=p.skin.width,h=p.skin.height;
  const px=Math.min(w-1,Math.max(0,Math.floor(point.x*w/overlayW)));
  const py=Math.min(h-1,Math.max(0,Math.floor(point.y*h/overlayH)));
  // 参考彩图：原版的框是 64 个**原图像素**（D 为真实图幅），因此必须从全分辨率帧裁剪，
  // 而不是从降采样后的工作图裁（那会让 64px 覆盖更大范围）。
  const fullW=p.img.naturalWidth,fullH=p.img.naturalHeight;
  const fx=Math.min(fullW-1,Math.max(0,Math.floor(point.x*fullW/overlayW)));
  const fy=Math.min(fullH-1,Math.max(0,Math.floor(point.y*fullH/overlayH)));
  const full=await fullResPixels(p);
  const patch=cropReferencePatch({data:full,width:fullW,height:fullH,point:[fx,fy]});
  requireFullReferencePatch(patch.rect); // 下游只接受64×64；不发明补边/缩放规则
  const src=p.skin.getContext('2d').getImageData(0,0,w,h);
  const alpha=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++)alpha[i]=src.data[i*4+3];
  // 只裁切；放大到64×64由主进程用已验证的 mono64 完成（渲染端不能require该CJS）。
  const maskCrop=cropReferenceMaskRaw({data:alpha,width:w,height:h,stride:w,point:[px,py]});
  // 用规范编码器产出PNG，不依赖canvas的chunk布局；随后经产品自身严格解码器验证。
  const encoded=await encodeReferencePNG64(patch.data);
  p.skinReference=replaceReference(p.skinReference,{image:patchToDataURL(patch),width:64,height:64,rect:null,pickPoint:[px,py]});
  p.referenceMaskCrop={data:maskCrop.data,width:maskCrop.width,height:maskCrop.height,stride:maskCrop.stride};
  p.referencePNGSupply={data:encoded,policy:'encoded-opaque-rgba8-reference64-no-metadata-transform'};
  $('reference-status').textContent=`已取色64×64 · 参考蒙版取自当前皮肤选区（非原版M6） · 工作点(${px},${py})`;
  $('reference-clear').disabled=false;$('reference-apply').disabled=false;$('reference-intensity-value').textContent=Number($('reference-intensity').value).toFixed(2);
  notify('已保存参考取色，可清除或重新点选');
  // 如实告知后端是否就绪，避免用户提交后才发现模型不可用。
  window.desktop?.skinReferenceStatus?.().then(st=>{
   if(st?.available)$('reference-status').textContent+=` · 后端就绪(ORT ${st.ortVersion??'?'})`;
   else notify('参考取色已保存，但处理后端不可用：'+(st?.reason??'模型未就绪'));
  }).catch(()=>{});
 }catch(error){notify('取色失败：'+error.message);}
}
// 按需读取全分辨率RGBA；缓存一次，避免重复解码大图。
// 按需读取全分辨率RGBA。**不缓存**：一张6000×4000照片约92MB，
// 多张同时驻留会拖垮渲染进程。每次作业后由调用方释放。
async function fullResPixels(p){
 const w=p.img.naturalWidth,h=p.img.naturalHeight;
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(p.img,0,0,w,h);
 return new Uint8Array(ctx.getImageData(0,0,w,h).data);
}
function bytesToDataURL(bytes,w,h){
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d'),img=ctx.createImageData(w,h);
 for(let i=0,n=w*h;i<n;i++){img.data[i*4]=bytes[i*4];img.data[i*4+1]=bytes[i*4+1];img.data[i*4+2]=bytes[i*4+2];img.data[i*4+3]=bytes[i*4+3];}
 ctx.putImageData(img,0,0);return c.toDataURL('image/png');
}
function patchToBytes(patch){
 const url=patchToDataURL(patch),bin=atob(url.slice(url.indexOf(',')+1)),out=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 return out;
}
function patchToDataURL(patch){
 const c=document.createElement('canvas');c.width=patch.width;c.height=patch.height;
 const ctx=c.getContext('2d'),img=ctx.createImageData(patch.width,patch.height);
 for(let i=0;i<patch.width*patch.height;i++){
  const s=i*4;img.data[s]=patch.data[s];img.data[s+1]=patch.data[s+1];img.data[s+2]=patch.data[s+2];img.data[s+3]=255;
 }
 ctx.putImageData(img,0,0);return c.toDataURL('image/png');
}
for(const id of ['skin','teeth','ai'])$(id+'-tab').onclick=()=>chooseMask(id);for(const id of ['brush','eraser','hand','native','face-skin'])$(id).onclick=()=>chooseTool(id);
$('reference-pick').onclick=()=>{if(!current())return;referencePicking=!referencePicking;$('reference-panel').hidden=false;$('reference-pick').classList.toggle('active',referencePicking);chooseTool(referencePicking?'hand':'brush');status(referencePicking?'参考取色：在照片上点选位置':'已退出参考取色');};
$('reference-apply').onclick=async()=>{
 const p=current();if(!p||busy)return;
 if(!p.referencePNGSupply||!p.referenceMaskCrop){notify('请先取色，再应用参考');return;}
 if(!window.desktop?.skinReference){notify('参考处理仅在桌面版可用');return;}
 // 先确认选区非空：全零选区会让参考效果无处可施，白跑一次模型。
 {
  const mw=p.skin.width,mh=p.skin.height;
  const chk=p.skin.getContext('2d').getImageData(0,0,mw,mh).data;
  let any=false;for(let i=3;i<chk.length;i+=4)if(chk[i]){any=true;break;}
  if(!any){notify('请先涂选皮肤区域，再应用参考');return;}
 }
 setBusy(true,'正在应用参考…');
 try{
  const w=p.skin.width,h=p.skin.height,maskW=w,maskH=h;
  // 工作图：从已读入的原图RGBA取物理RGB（原图与工作图同分辨率，本版不做缩放）。
  const work=readWorkingPixels(p.img),rgba=work.data,workingPhotoBytes=new Uint8Array(w*h*3);
  for(let i=0,n=w*h;i<n;i++){workingPhotoBytes[i*3]=rgba[i*4];workingPhotoBytes[i*3+1]=rgba[i*4+1];workingPhotoBytes[i*3+2]=rgba[i*4+2];}
  // 当前蒙版：产品皮肤选区的alpha，独立分辨率。
  const src=p.skin.getContext('2d').getImageData(0,0,maskW,maskH);
  const alpha=new Uint8Array(maskW*maskH);
  for(let i=0;i<maskW*maskH;i++)alpha[i]=src.data[i*4+3];
  const request=buildReferenceJobRequest({
   // 派生照片要保留原图分辨率：这里用全分辨率像素，工作图与选区仍是工作分辨率。
   originalPixels:await fullResPixels(p),originalWidth:p.img.naturalWidth,originalHeight:p.img.naturalHeight,
   workingPhoto:{data:workingPhotoBytes,width:w,height:h,stride:w*3,format:301},
   currentMask:{data:alpha,width:maskW,height:maskH,stride:maskW},
   referencePNG:p.referencePNGSupply,referenceMaskCrop:p.referenceMaskCrop,
   // 混合掩码：使用用户自己画的皮肤选区，让参考效果只作用在被选中的像素。
   // 这不是原版 M6 的规则（未证实），而是用产品已有的人工选区作为作用域。
   blendMask:{data:alpha,width:w,height:h,stride:w},
   // 本版尚无二次保护区域供给，显式声明为空，而不是静默补零。
   secondaryTestMask:null,
   intensity:Number($('reference-intensity').value),referenceRevision:p.skinReference.revision});
  // Electron IPC 使用结构化克隆，TypedArray 可原样传递，不做逐元素数组化。
  const result=await window.desktop.skinReference(request);
  if(!result||!(result.output instanceof Uint8Array))throw new Error('参考处理未返回有效像素结果');
  // output 是整幅同布局帧（channels/stride 与 original 相同），直接作为派生照片的像素。
  const stem=p.name.replace(/\.[^.]+$/,'');let name=stem+'-参考肤色.png',n=2;
  while(photos.some(x=>x.name===name))name=`${stem}-参考肤色-${n++}.png`;
  const changed=result.changedRGBFields??0;
  const derived=await makePhoto(name,bytesToDataURL(result.output,p.img.naturalWidth,p.img.naturalHeight),
   {...p.params},p.skin.toDataURL(),p.teeth.toDataURL(),p.ai.toDataURL(),p.aiPoints,
   p.nativeTeethFaces,p.brightEyeFaces,p.skinReference);
  photos.push(derived);select(photos.length-1);markDirty();updateLibrary();
  const message=`已生成参考肤色副本 · 修订${result.referenceRevision??'-'}${changed?'':' · 当前强度未产生像素变化'} · 原照片保留在照片库`;
  status(message);notify(message);
 }catch(error){notify('参考应用失败：'+error.message);}
 finally{setBusy(false);}
};
$('reference-clear').onclick=()=>{const p=current();if(!p)return;p.skinReference=clearReference(p.skinReference);p.referenceMaskCrop=null;p.referencePNGSupply=null;$('reference-status').textContent='参考图已清除';$('reference-clear').disabled=true;$('reference-apply').disabled=true;notify('已清除参考图');};
$('reference-intensity').addEventListener('input',()=>{$('reference-intensity-value').textContent=Number($('reference-intensity').value).toFixed(2);});
$('brush-size').oninput=()=>$('brush-size-value').textContent=$('brush-size').value;$('selection-mode').onchange=()=>{drawOverlay();updateMaskStatus();};$('show-face-boxes').onchange=drawOverlay;
$('view-skin').onclick=()=>chooseMask('skin');$('view-ai').onclick=()=>chooseMask('ai');
$('compare').onclick=()=>{compare=!compare;updateUI();render();};$('split').oninput=queueRender;$('zoom').onchange=()=>{fitImage();drawOverlay();};new ResizeObserver(()=>{fitImage();drawOverlay();}).observe(viewport);
document.addEventListener('dragover',e=>{e.preventDefault();viewport.classList.add('dragover');});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)viewport.classList.remove('dragover');});document.addEventListener('drop',e=>{e.preventDefault();viewport.classList.remove('dragover');importFiles(e.dataTransfer.files);});

async function saveFile(kind,name,data){
 if(window.desktop)return window.desktop.saveFile({kind,name,data});
 const blob=new Blob([data],{type:kind==='project'?'application/json':kind==='png'?'image/png':'image/jpeg'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return {canceled:false};
}
function selectedGroups(){return [...document.querySelectorAll('[data-sync-group]:checked')].map(el=>el.dataset.syncGroup).filter(group=>Object.hasOwn(PARAM_GROUPS,group));}
$('mark-all').onclick=()=>{if(busy)return;marked=new Set(photos);updateLibrary();updateUI();};
$('mark-none').onclick=()=>{if(busy)return;marked.clear();updateLibrary();updateUI();};
$('sync-params').onclick=()=>{
 if(busy||!current())return;endStroke();
 try{const groups=selectedGroups(),source=current();const changes=photos.filter(p=>marked.has(p)&&p!==source).map(p=>({p,params:syncParams(p.params,source.params,groups)}));
  for(const {p,params} of changes){p.params=params;p.history.push(snapshot(p));p.edited=true;}if(changes.length)markDirty();updateLibrary();updateUI();notify(`参数已同步到 ${changes.length} 张照片，选区保持独立。`);
 }catch(error){notify('同步失败：'+error.message);}
};
$('save-preset').onclick=async()=>{
 if(busy||!current())return;endStroke();setBusy(true);
 try{const preset=createPreset($('preset-name').value,current().params,selectedGroups());const result=await saveFile('preset',preset.name+'.gypreset',serializePreset(preset));if(!result.canceled)notify('预设已保存：'+preset.name);else status('已取消保存预设');}catch(error){notify('预设保存失败：'+error.message);}finally{setBusy(false);}
};
$('load-preset').onclick=()=>{if(!busy&&current())$('preset-file').click();};
$('preset-file').onchange=async event=>{
 const file=event.target.files[0],p=current();if(!file||!p||busy)return;endStroke();setBusy(true);
 try{if(file.size>65536)throw new Error('预设文件过大');const preset=validatePreset(await file.text());p.params=syncParams(p.params,preset.params,preset.groups);setBusy(false);commit();render();notify('预设已应用到当前照片：'+preset.name);}catch(error){notify('预设导入失败：'+error.message);}finally{event.target.value='';setBusy(false);}
};
$('batch-cancel').onclick=()=>{batchCanceled=true;$('batch-cancel').disabled=true;$('batch-text').textContent='正在结束当前照片…';};
$('batch-export').onclick=async()=>{
 if(busy||!marked.size||!window.desktop?.batchBegin)return;endStroke();const targets=photos.filter(p=>marked.has(p));const type=$('format').value,extension=type==='image/png'?'png':'jpg';let session,completed=0;const failures=[];batchCanceled=false;setBusy(true,'请选择批量导出位置…');
 try{session=await window.desktop.batchBegin();if(session.canceled){status('已取消批量导出');return;}
  const names=planExportNames(targets.map(p=>p.name),extension);$('batch-progress').hidden=false;$('batch-meter').max=targets.length;$('batch-meter').value=0;$('batch-cancel').disabled=false;
  for(let i=0;i<targets.length;i++){
   if(batchCanceled)break;const p=targets[i];$('batch-text').textContent=`正在导出 ${i+1} / ${targets.length} · ${p.name}`;status($('batch-text').textContent);await new Promise(resolve=>setTimeout(resolve,20));if(batchCanceled)break;
   try{engine.setImage(p.img);engine.setMasks(p.skin,p.teeth,p.ai,p.nativeTeethFaces);engine.setBrightEyeFaces(p.brightEyeFaces);contourCache=null;const blob=await engine.exportBlob(p.params,type);await window.desktop.batchWrite({id:session.id,name:names[i],data:new Uint8Array(await blob.arrayBuffer())});completed++;}catch(error){failures.push(`${p.name}：${error.message}`);}
   $('batch-meter').value=i+1;
  }
  const folder=await window.desktop.batchFinish(session.id);session=null;
  const prefix=batchCanceled?'批量导出已取消':'批量导出完成';notify(`${prefix}：成功 ${completed} 张，失败 ${failures.length} 张。${failures.length?' '+failures.join('；'):''} 保存位置：${folder}`);$('batch-text').textContent=`成功 ${completed} 张 · 失败 ${failures.length} 张${batchCanceled?' · 已取消剩余':''}`;
 }catch(error){notify('批量导出失败：'+error.message);}finally{if(session?.id)await window.desktop.batchFinish(session.id).catch(()=>{});setBusy(false);$('batch-cancel').disabled=true;if(current())select(selected);}
};
$('export').onclick=async()=>{
 const p=current();if(!p||busy)return;setBusy(true,'正在按原尺寸生成图片…');
 try{await new Promise(r=>setTimeout(r,30));const type=$('format').value,kind=type==='image/png'?'png':'jpg';const blob=await engine.exportBlob(p.params,type);const name=p.name.replace(/\.[^.]+$/,'')+`_光屿.${kind}`;const result=await saveFile(kind,name,new Uint8Array(await blob.arrayBuffer()));status(result.canceled?'已取消导出':`已导出 ${name} · ${p.img.naturalWidth} × ${p.img.naturalHeight}`);if(!result.canceled)notify(`照片已导出：${name}`);}
 catch(e){notify(`导出失败：${e.message}`);}finally{setBusy(false);}
};
$('save-project').onclick=async()=>{
 if(!photos.length||busy)return;setBusy(true,'正在保存工程…');
 try{const project={version:1,photos:photos.map(projectPhotoRecord)};const result=await saveFile('project','光屿工程.guangyu.json',JSON.stringify(project));if(!result.canceled){dirty=false;document.title='光屿修图';notify('工程已保存，包含原图、参数和涂选区域。');}else status('已取消保存');}catch(e){notify(`保存失败：${e.message}`);}finally{setBusy(false);}
};
$('load-examples').onclick=async()=>{if(busy)return;if(!window.desktop?.nativeExamples){notify('示例照片仅在桌面试验版中提供');return;}setBusy(true,'正在导入六张原模型示例…');try{const examples=await window.desktop.nativeExamples();const first=photos.length;for(const p of examples)photos.push(await makePhoto(p.name,p.original));select(first);markDirty();updateLibrary();status('已导入六张原图示例，点击原模型选区开始试验。');}catch(error){notify('示例导入失败：'+error.message);}finally{setBusy(false);}};
$('open-project').onclick=()=>$('project-file').click();
$('project-file').onchange=async e=>{
 const file=e.target.files[0];if(!file||busy)return;if(dirty&&!confirm('打开工程将替换当前工作台。未保存的编辑会丢失，是否继续？')){e.target.value='';return;}
 setBusy(true,'正在恢复工程…');try{const project=validateProject(JSON.parse(await file.text()));const loaded=[];for(const p of project.photos)loaded.push(await restoreProjectPhoto(p,makePhoto));photos=loaded;marked.clear();select(0);dirty=false;document.title='光屿修图';notify(`已恢复 ${photos.length} 张照片及编辑。`);}catch(err){notify(`无法打开工程：${err.message}`);}finally{e.target.value='';setBusy(false);}
};
document.addEventListener('keydown',e=>{
 if(busy)return;const mod=e.ctrlKey||e.metaKey;
 if(e.key==='Escape'&&tool==='face-skin'){e.preventDefault();endStroke();chooseTool('brush');status('已取消框脸');return;}
 if(e.key==='Escape'&&referencePicking){e.preventDefault();referencePicking=false;$('reference-pick').classList.remove('active');status('已退出参考取色');return;}
 if(painting&&(mod||['b','e','h','c'].includes(e.key.toLowerCase())))endStroke();
 if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();$('save-project').click();return;}
 if(mod&&e.key.toLowerCase()==='o'){e.preventDefault();$('files').click();return;}
 if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();return;}
 if(e.target.matches('input,select'))return;
 if(e.key.toLowerCase()==='b')chooseTool('brush');if(e.key.toLowerCase()==='e')chooseTool('eraser');if(e.key.toLowerCase()==='h')chooseTool('hand');if(e.key.toLowerCase()==='c')$('compare').click();
});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
chooseTool('brush');updateUI();
