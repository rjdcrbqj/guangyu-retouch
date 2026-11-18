import {validateNativeTeethFaces} from './teeth-v3-parameters.js';
import {normalizeEffectState} from './ai-effect-stack.js';
import {normalizeReferenceState} from './reference-skin-state.js';
import {validateBrightEyeFaces} from './bright-eye-parameters.js';
import {BULK_SPECS,BULK_DEFAULTS} from './bulk-params.js';
import {normalizePerspective} from './public-perspective.js';
import {normalizeLiquify} from './public-liquify.js';
import {unpackBackground} from './public-background.js';
import {unpackSky} from './public-sky.js';
import {sameRemovals,unpackRemovals} from './object-removal.js';
import {cloneExpansion,sameExpansion,unpackExpansion} from './canvas-expansion.js';
export const DEFAULTS = Object.freeze({ ...BULK_DEFAULTS, exposure:0, sharpAmount:0, sharpRadius:2, contrast:0, saturation:0, warmth:0, skinSmooth:0, skinBright:0, teethBright:0, localExposure:0,vibrance:0,nativeContrast:0,contrastPivot:50,localVibrance:0,localContrast:0,localContrastPivot:50 });
const limits={sharpAmount:[0,300],sharpRadius:[1,12],exposure:[-2,2],contrast:[-50,50],saturation:[-50,50],warmth:[-50,50],skinSmooth:[0,100],skinBright:[0,100],teethBright:[0,100],localExposure:[-2,2],vibrance:[-100,100],nativeContrast:[-100,100],contrastPivot:[0,100],localVibrance:[-100,100],localContrast:[-100,100],localContrastPivot:[0,100]};

for(const s of BULK_SPECS)limits[s.key]=[s.min,s.max];

// 在工程入口约束参数，避免无效值污染画面。
export function normalizeParams(input={}) {
 const result={...DEFAULTS};
 for(const key of Object.keys(result)) { const n=Number(input?.[key]); if(Number.isFinite(n))result[key]=Math.min(limits[key][1],Math.max(limits[key][0],n)); }
 if(![0,1].includes(result.wrinkleMode))result.wrinkleMode=DEFAULTS.wrinkleMode;
 if(![0,1].includes(result.whiteHairMode))result.whiteHairMode=DEFAULTS.whiteHairMode;
 result.lipColorRGB=Math.round(result.lipColorRGB);
 return result;
}

// 直接比较内嵌图像字符串，避免在判断状态是否改变时重复串行化。
export function samePhotoState(first,second){
 if(!first||!second)return first===second;
 const {background:a,sky:c,skyMask:am,removals:ar,expansion:ae,...source}=first;
 const {background:b,sky:d,skyMask:bm,removals:br,expansion:be,...target}=second;
 const equal=(left,right)=>left===right||Boolean(left&&right&&Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>left[key]===right[key]));
 return am===bm&&equal(a,b)&&equal(c,d)&&sameRemovals(ar,br)&&sameExpansion(ae,be)&&JSON.stringify(source)===JSON.stringify(target);
}

// 图像数据是不可变字符串，历史只复制编辑对象与几何设置。
export function copyPhotoState(value){
 if(!value?.background&&!value?.sky&&!value?.removals&&!value?.expansion)return structuredClone(value);
 const {background,sky,removals,expansion,...state}=value;
 return {...structuredClone(state),...(background?{background:{...background}}:{}),...(sky?{sky:{...sky}}:{}),
  ...(removals?{removals:removals.map(item=>({...item,rect:{...item.rect}}))}:{}),...(expansion?{expansion:cloneExpansion(expansion)}:{})};
}

const photoHistoryLimit=20;
function validateHistoryRecord(record){
 if(!record||!Array.isArray(record.items)||!record.items.length||record.items.length>photoHistoryLimit||
    !Number.isInteger(record.index)||record.index<0||record.index>=record.items.length)throw Error('照片历史记录损坏。');
}

export class History {
 constructor(initial,limit=photoHistoryLimit){this.items=[copyPhotoState(initial)];this.index=0;this.limit=limit;}
 get current(){return copyPhotoState(this.items[this.index]);}
 get canUndo(){return this.index>0;}
 get canRedo(){return this.index<this.items.length-1;}
 push(value){
  if(samePhotoState(value,this.items[this.index]))return;
  this.items.splice(this.index+1);this.items.push(copyPhotoState(value));
  if(this.items.length>this.limit)this.items.shift();this.index=this.items.length-1;
 }
 undo(){if(this.canUndo)this.index--;return this.current;}
 redo(){if(this.canRedo)this.index++;return this.current;}
 toRecord(){return {items:this.items.map(copyPhotoState),index:this.index};}
 static fromRecord(record){
  validateHistoryRecord(record);
  const history=new History(null);history.items=record.items.map(copyPhotoState);history.index=record.index;return history;
 }
}

// 模型每次输出一个独立选区；此处执行蒙版操作，不伪造模型的负点提示。
// 原 SmartSelectMask.frag：cm1=clamp(v+s)，cm2=clamp(v-s)。
export function combineSoftMasks(base,incoming,operation='add'){
 if(base.length!==incoming.length||base.length%4)throw new Error('蒙版尺寸不匹配');
 const output=new Uint8ClampedArray(base.length);
 for(let i=0;i<base.length;i+=4){output[i]=output[i+1]=output[i+2]=255;output[i+3]=operation==='subtract'?Math.max(0,base[i+3]-incoming[i+3]):Math.min(255,base[i+3]+incoming[i+3]);}
 return output;
}

// 工程嵌入原图和蒙版，恢复时不读取任意外部路径。
export function validateProject(input){
 if(![1,2,3,4,5,6,7,8,9,10,11,12].includes(input?.version)||!Array.isArray(input.photos)||!input.photos.length)throw new Error('这不是支持的光屿工程文件。');
 const dataImage=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;
 return {version:input.version,photos:input.photos.map(p=>{
  if(typeof p.name!=='string'||typeof p.original!=='string'||!dataImage.test(p.original))throw new Error('工程中的照片数据不完整。');
  if(p.params&&Object.hasOwn(p.params,'wrinkleMode')&&![0,1].includes(p.params.wrinkleMode))throw new Error('工程中的祛皱模式无效。');
  if(p.params&&Object.hasOwn(p.params,'whiteHairMode')&&![0,1].includes(p.params.whiteHairMode))throw new Error('工程中的去白发模式无效。');
  for(const key of ['skinMask','teethMask','aiMask'])if(p[key]!==undefined&&(!dataImage.test(p[key])||typeof p[key]!=='string'))throw new Error('工程中的涂选区域损坏。');
  const photo={name:p.name,original:p.original,params:normalizeParams(p.params),skinReference:normalizeReferenceState(p.skinReference),skinMask:p.skinMask,teethMask:p.teethMask,aiMask:p.aiMask,nativeTeethFaces:validateNativeTeethFaces(p.nativeTeethFaces),brightEyeFaces:validateBrightEyeFaces(p.brightEyeFaces),aiPoints:Array.isArray(p.aiPoints)?p.aiPoints.filter(pt=>pt&&[pt.x,pt.y].every(Number.isFinite)&&pt.x>=0&&pt.x<=1&&pt.y>=0&&pt.y<=1&&[0,1].includes(pt.label)).slice(0,64):[]};
  if(input.version<4&&photo.brightEyeFaces.some(f=>f.format==='guangyu-public-bright-eye-face'))throw Error('公开亮眼缓存需要工程格式 4。');
  if(p.perspective!=null&&input.version<5)throw Error('透视校正需要工程格式 5。');
  const perspective=normalizePerspective(p.perspective);
  if(perspective)photo.perspective=perspective;
  if(p.liquify!=null&&input.version<6)throw Error('液化需要工程格式 6。');
  const liquify=normalizeLiquify(p.liquify);
  if(liquify.length)photo.liquify=liquify;
  if(p.subjectMask!==undefined){
   if(input.version<7)throw Error('人像抠图需要工程格式 7。');
   if(typeof p.subjectMask!=='string'||p.subjectMask.length>16*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(p.subjectMask))throw Error('工程中的主体蒙版损坏。');
   photo.subjectMask=p.subjectMask;
  }
  const assets=p.backgroundAssets??[];
  if(!Array.isArray(assets)||assets.length>(input.version>=10?40:20))throw Error('工程中的背景照片列表无效。');
  if(p.backgroundAssets!==undefined&&input.version<8)throw Error('背景替换需要工程格式 8。');
  function applyBackground(target,value){
   if(value===undefined)return;
   if(input.version<8)throw Error('背景替换需要工程格式 8。');
   if(!target.subjectMask)throw Error('背景替换需要主体蒙版。');
   const background=unpackBackground(value,assets);
   if(background?.light&&input.version<9)throw Error('背景光影融合需要工程格式 9。');
   if(background)target.background=background;
  }
  applyBackground(photo,p.background);
  function applySky(target,mask,value){
   if(mask===undefined&&value===undefined)return;
   if(input.version<10)throw Error('天空替换需要工程格式 10。');
   if(typeof mask!=='string'||mask.length>16*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(mask))throw Error('工程中的天空选区无效。');
   target.skyMask=mask;
   if(value!==undefined)target.sky=unpackSky(value,assets);
  }
  applySky(photo,p.skyMask,p.sky);
  if(p.removalAssets!==undefined&&input.version<11)throw Error('物体移除需要工程格式 11。');
  const removalAssets=p.removalAssets??[];
  if(!Array.isArray(removalAssets))throw Error('工程中的修补资源无效。');
  function applyRemovals(target,value){
   if(value===undefined)return;
   if(input.version<11)throw Error('物体移除需要工程格式 11。');
   const repairs=unpackRemovals(value,removalAssets);
   if(repairs.length)target.removals=repairs;
  }
  applyRemovals(photo,p.removals);
  if(p.expansionAssets!==undefined&&input.version<12)throw Error('扩画布需要工程格式 12。');
  const expansionAssets=p.expansionAssets??[];
  if(!Array.isArray(expansionAssets)||expansionAssets.length>photoHistoryLimit*4)throw Error('工程中的扩画布资源无效。');
  let expansionCore;
  function applyExpansion(target,value){
   if(value===undefined)return;
   if(input.version<12)throw Error('扩画布需要工程格式 12。');
   const expansion=unpackExpansion(value,expansionAssets);
   if(!expansion)return;
   const core=expansion.core;
   if(expansionCore&&(expansionCore.width!==core.width||expansionCore.height!==core.height))throw Error('扩画布记录的原图尺寸不一致。');
   expansionCore=core;
   target.expansion=expansion;
  }
  applyExpansion(photo,p.expansion);
  if(p.effects!=null)photo.effects=normalizeEffectState(p.effects);
  if(p.history!==undefined){
   try{
    validateHistoryRecord(p.history);
    const items=p.history.items.map(s=>{
     if(!s||['skin','teeth','ai'].some(key=>typeof s[key]!=='string'||!dataImage.test(s[key])))throw Error('选区损坏');
     // 复用照片入口的校验；不传 history，避免嵌套历史递归。
     const checked=validateProject({version:input.version,photos:[{name:p.name,original:p.original,params:s.params,skinMask:s.skin,teethMask:s.teeth,aiMask:s.ai,aiPoints:s.aiPoints,nativeTeethFaces:s.nativeTeethFaces,brightEyeFaces:s.brightEyeFaces,skinReference:s.skinReference,effects:s.effects,perspective:s.perspective,liquify:s.liquify,subjectMask:s.subjectMask}]}).photos[0];
     applyBackground(checked,s.background);
     applySky(checked,s.skyMask,s.sky);
     applyRemovals(checked,s.removals);
     applyExpansion(checked,s.expansion);
     return historyState(checked);
    });
    const history=History.fromRecord({items,index:p.history.index});
    if(!samePhotoState(history.current,historyState(photo)))throw Error('当前状态不匹配');
    photo.history=history.toRecord();
   }catch{throw Error('工程中的照片历史损坏或与当前照片不一致。');}
  }
  return photo;
 })};
}

function historyState(p){return {params:p.params,skin:p.skinMask,teeth:p.teethMask,ai:p.aiMask,aiPoints:p.aiPoints,nativeTeethFaces:p.nativeTeethFaces,brightEyeFaces:p.brightEyeFaces,skinReference:p.skinReference,...(p.effects?{effects:p.effects}:{}),...(p.perspective?{perspective:p.perspective}:{}),...(p.liquify?.length?{liquify:p.liquify}:{}),...(p.subjectMask?{subjectMask:p.subjectMask}:{}),...(p.background?{background:p.background}:{}),...(p.skyMask?{skyMask:p.skyMask}:{}),...(p.sky?{sky:p.sky}:{}),...(p.removals?.length?{removals:p.removals}:{}),...(p.expansion?{expansion:p.expansion}:{})};}
