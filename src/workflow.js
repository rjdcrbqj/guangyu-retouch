import {BULK_SPECS,BULK_DEFAULTS} from './bulk-params.js';
import { normalizeParams } from './model.js';

// 分组保存标量效果与生成副本的设置；照片坐标、蒙版和模型特征各自保存。
const HISTORICAL_GROUPS=Object.freeze({
 basic:Object.freeze(['sharpAmount','sharpRadius','exposure','contrast','saturation','warmth','vibrance','nativeContrast','contrastPivot']),
 skin:Object.freeze(['skinSmooth','skinBright']),
 teeth:Object.freeze(['teethBright']),
 eyes:Object.freeze([]),
 wrinkle:Object.freeze([]),
 lip:Object.freeze([]),
 unify:Object.freeze([]),
 local:Object.freeze(['localExposure','localVibrance','localContrast','localContrastPivot'])
});
export const PARAM_GROUPS=Object.freeze(Object.fromEntries(Object.entries(HISTORICAL_GROUPS).map(([group,keys])=>[group,Object.freeze([...keys,...BULK_SPECS.filter(s=>s.group===group).map(s=>s.key)])])));
const RELEASED_V050_BASIC_KEYS=Object.freeze([...HISTORICAL_GROUPS.basic,'fadeAmount','hueRotation','blackWhiteAmount']);
const RELEASED_V051_BASIC_KEYS=Object.freeze([...RELEASED_V050_BASIC_KEYS,'vignetteAmount','vignetteMidpoint','vignetteRoundness','vignetteFeather','vignetteHighlights']);
const RELEASED_V055_EYE_KEYS=Object.freeze(['brightEyeLeftMaster','brightEyeLeftWhite','brightEyeLeftOther','brightEyeLeftHigh','brightEyeRightMaster','brightEyeRightWhite','brightEyeRightOther','brightEyeRightHigh']);
const RELEASED_V056_EYE_KEYS=Object.freeze([...RELEASED_V055_EYE_KEYS,'eyeBagStrength','eyeBagKeep']);
const PRESET_FORMAT='guangyu-preset';
const MAX_PRESET_LENGTH=65536;

function checkedGroups(groups){
 if(!Array.isArray(groups)||!groups.length||groups.some(g=>typeof g!=='string'||!Object.hasOwn(PARAM_GROUPS,g)))throw new Error('请至少选择一个有效的参数分组。');
 return [...new Set(groups)];
}

// 将数值规范化后提取选定分组，不读取任何图像状态。
export function selectParams(params,groups=['basic']){
 const keys=checkedGroups(groups).flatMap(g=>PARAM_GROUPS[g]),normalized=normalizeParams(params);
 return Object.fromEntries(keys.map(key=>[key,normalized[key]]));
}

// 同步只覆盖显式选择的数值；返回新对象，便于调用方记录撤销历史。
export function syncParams(targetParams,sourceParams,groups=['basic']){
 return {...normalizeParams(targetParams),...selectParams(sourceParams,groups)};
}

function checkedName(name){
 if(typeof name!=='string'||!name.trim()||name.trim().length>120||/[\x00-\x1f]/.test(name))throw new Error('预设名称需为 1–120 个可显示字符。');
 return name.trim();
}
function isRecord(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}

// 自有预设格式不包含原图、模型数据或空间蒙版，也不兼容其他软件的预设格式。
export function createPreset(name,params,groups=['basic']){
 const selected=checkedGroups(groups);
 return {format:PRESET_FORMAT,version:1,name:checkedName(name),groups:selected,params:selectParams(params,selected)};
}

// 导入严格拒绝未知字段和越界值，避免将不支持的效果悄悄转成默认值。
export function validatePreset(input){
 let value=input;
 if(typeof input==='string'){
  if(input.length>MAX_PRESET_LENGTH)throw new Error('预设文件过大。');
  try{value=JSON.parse(input);}catch{throw new Error('预设不是有效的 JSON 文件。');}
 }
 if(!isRecord(value)||value.format!==PRESET_FORMAT||value.version!==1)throw new Error('这不是支持的光屿预设文件。');
 const topKeys=['format','version','name','groups','params'];
 if(Object.keys(value).some(key=>!topKeys.includes(key)))throw new Error('预设包含不支持的字段。');
 const name=checkedName(value.name),groups=checkedGroups(value.groups),keys=groups.flatMap(g=>PARAM_GROUPS[g]);
 if(!isRecord(value.params)||Object.keys(value.params).some(key=>!keys.includes(key)))throw new Error('预设参数与所选分组不匹配。');
 // 每组只接受完整现版本或已发布历史版本；缺任意现版本字段不当作旧版。
 const params={...value.params};
 for(const group of groups){
  const current=PARAM_GROUPS[group],historic=HISTORICAL_GROUPS[group];
  const present=current.filter(k=>Object.hasOwn(params,k));
  const candidates=[current,...(historic.length?[historic]:[]),...(group==='eyes'?[RELEASED_V055_EYE_KEYS,RELEASED_V056_EYE_KEYS]:[]),...(group==='basic'?[RELEASED_V051_BASIC_KEYS,RELEASED_V050_BASIC_KEYS,historic.filter(k=>!['sharpAmount','sharpRadius'].includes(k))]:[])];
  if(!candidates.some(candidate=>candidate.length===present.length&&candidate.every(k=>Object.hasOwn(params,k))))throw new Error('预设参数与所选分组不匹配。');
  for(const key of current)if(!Object.hasOwn(params,key))params[key]=key==='sharpRadius'?2:(BULK_DEFAULTS[key]??0);
 }
 const normalized=normalizeParams(params);
 for(const key of keys){
  if(!Object.hasOwn(params,key)||typeof params[key]!=='number'||!Number.isFinite(params[key])||normalized[key]!==params[key])throw new Error('预设参数缺失或超出支持范围。');
 }
 return {format:PRESET_FORMAT,version:1,name,groups,params:Object.fromEntries(keys.map(key=>[key,params[key]]))};
}

export function serializePreset(preset){return JSON.stringify(validatePreset(preset),null,2);}

function exportStem(name){
 if(typeof name!=='string')throw new Error('导出照片名称无效。');
 let stem=name.split(/[\\/]/).pop().normalize('NFC').replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').trim();
 if(!stem||/^\.+$/.test(stem))stem='照片';
 if(/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem))stem='_'+stem;
 return Array.from(stem).slice(0,100).join('').replace(/[. ]+$/,'')||'照片';
}

// 仅规划一个新目录中的名称。实际写文件仍须使用排他创建，防止外部同名文件被覆盖。
export function planExportNames(names,extension){
 if(!Array.isArray(names))throw new Error('导出照片列表无效。');
 const ext=typeof extension==='string'?extension.toLowerCase().replace(/^\./,''):'';
 if(!['jpg','jpeg','png'].includes(ext))throw new Error('导出格式仅支持 JPG 或 PNG。');
 const suffix=ext==='jpeg'?'jpg':ext,used=new Set();
 return names.map(name=>{
  const stem=exportStem(name);let candidate=`${stem}.${suffix}`,number=2;
  while(used.has(candidate.toLowerCase()))candidate=`${stem} (${number++}).${suffix}`;
  used.add(candidate.toLowerCase());return candidate;
 });
}
