import {validateNativeTeethFaces} from './teeth-v3-parameters.js';
import {normalizeEffectState} from './ai-effect-stack.js';
import {normalizeReferenceState} from './reference-skin-state.js';
import {validateBrightEyeFaces} from './bright-eye-parameters.js';
import {BULK_SPECS,BULK_DEFAULTS} from './bulk-params.js';
export const DEFAULTS = Object.freeze({ ...BULK_DEFAULTS, exposure:0, sharpAmount:0, sharpRadius:2, contrast:0, saturation:0, warmth:0, skinSmooth:0, skinBright:0, teethBright:0, localExposure:0,vibrance:0,nativeContrast:0,contrastPivot:50,localVibrance:0,localContrast:0,localContrastPivot:50 });
const limits={sharpAmount:[0,300],sharpRadius:[1,12],exposure:[-2,2],contrast:[-50,50],saturation:[-50,50],warmth:[-50,50],skinSmooth:[0,100],skinBright:[0,100],teethBright:[0,100],localExposure:[-2,2],vibrance:[-100,100],nativeContrast:[-100,100],contrastPivot:[0,100],localVibrance:[-100,100],localContrast:[-100,100],localContrastPivot:[0,100]};

for(const s of BULK_SPECS)limits[s.key]=[s.min,s.max];

// 在工程入口约束参数，避免无效值污染画面。
export function normalizeParams(input={}) {
 const result={...DEFAULTS};
 for(const key of Object.keys(result)) { const n=Number(input?.[key]); if(Number.isFinite(n))result[key]=Math.min(limits[key][1],Math.max(limits[key][0],n)); }
 if(![0,1].includes(result.wrinkleMode))result.wrinkleMode=DEFAULTS.wrinkleMode;
 return result;
}

export class History {
 constructor(initial,limit=20){this.items=[structuredClone(initial)];this.index=0;this.limit=limit;}
 get current(){return structuredClone(this.items[this.index]);}
 get canUndo(){return this.index>0;}
 get canRedo(){return this.index<this.items.length-1;}
 push(value){
  if(JSON.stringify(value)===JSON.stringify(this.items[this.index]))return;
  this.items.splice(this.index+1);this.items.push(structuredClone(value));
  if(this.items.length>this.limit)this.items.shift();this.index=this.items.length-1;
 }
 undo(){if(this.canUndo)this.index--;return this.current;}
 redo(){if(this.canRedo)this.index++;return this.current;}
 toRecord(){return {items:structuredClone(this.items),index:this.index};}
 static fromRecord(record){
  if(!record||!Array.isArray(record.items)||!record.items.length||record.items.length>20||!Number.isInteger(record.index)||record.index<0||record.index>=record.items.length)throw Error('照片历史记录损坏。');
  const history=new History(record.items[0]);history.items=structuredClone(record.items);history.index=record.index;return history;
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
 if(![1,2].includes(input?.version)||!Array.isArray(input.photos)||!input.photos.length)throw new Error('这不是支持的光屿工程文件。');
 const dataImage=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;
 return {version:input.version,photos:input.photos.map(p=>{
  if(typeof p.name!=='string'||typeof p.original!=='string'||!dataImage.test(p.original))throw new Error('工程中的照片数据不完整。');
  if(p.params&&Object.hasOwn(p.params,'wrinkleMode')&&![0,1].includes(p.params.wrinkleMode))throw new Error('工程中的祛皱模式无效。');
  for(const key of ['skinMask','teethMask','aiMask'])if(p[key]!==undefined&&(!dataImage.test(p[key])||typeof p[key]!=='string'))throw new Error('工程中的涂选区域损坏。');
  const photo={name:p.name,original:p.original,params:normalizeParams(p.params),skinReference:normalizeReferenceState(p.skinReference),skinMask:p.skinMask,teethMask:p.teethMask,aiMask:p.aiMask,nativeTeethFaces:validateNativeTeethFaces(p.nativeTeethFaces),brightEyeFaces:validateBrightEyeFaces(p.brightEyeFaces),aiPoints:Array.isArray(p.aiPoints)?p.aiPoints.filter(pt=>pt&&[pt.x,pt.y].every(Number.isFinite)&&pt.x>=0&&pt.x<=1&&pt.y>=0&&pt.y<=1&&[0,1].includes(pt.label)).slice(0,64):[]};
  if(p.effects!=null)photo.effects=normalizeEffectState(p.effects);
  if(p.history!==undefined){
   try{
    const history=History.fromRecord(p.history);
    history.items=history.items.map(s=>{
     if(!s||['skin','teeth','ai'].some(key=>typeof s[key]!=='string'||!dataImage.test(s[key])))throw Error('选区损坏');
     // 复用照片入口的校验；不传 history，避免嵌套历史递归。
     const checked=validateProject({version:1,photos:[{name:p.name,original:p.original,params:s.params,skinMask:s.skin,teethMask:s.teeth,aiMask:s.ai,aiPoints:s.aiPoints,nativeTeethFaces:s.nativeTeethFaces,brightEyeFaces:s.brightEyeFaces,skinReference:s.skinReference,effects:s.effects}]}).photos[0];
     return historyState(checked);
    });
    if(JSON.stringify(history.current)!==JSON.stringify(historyState(photo)))throw Error('当前状态不匹配');
    photo.history=history.toRecord();
   }catch{throw Error('工程中的照片历史损坏或与当前照片不一致。');}
  }
  return photo;
 })};
}

function historyState(p){return {params:p.params,skin:p.skinMask,teeth:p.teethMask,ai:p.aiMask,aiPoints:p.aiPoints,nativeTeethFaces:p.nativeTeethFaces,brightEyeFaces:p.brightEyeFaces,skinReference:p.skinReference,...(p.effects?{effects:p.effects}:{})};}
