import regions from './wrinkle-region-contract.js';
import {normalizeReferenceEffect} from './reference-effect.js';

export const EFFECTS=Object.freeze({
 portrait:{method:'portraitRepair',label:'净肤',group:'skin',status:'repair-status'},
 wrinkle:{method:'wrinkleRepair',label:'祛皱',group:'wrinkle',status:'wrinkle-status'},
 'eye-bag':{method:'eyeBagRepair',label:'去眼袋',group:'eyes',status:'eye-bag-status'},
 'dark-circles':{method:'darkCirclesRepair',label:'祛黑眼圈',group:'eyes',status:'dark-circles-status'},
 'iris-editing':{method:'irisEditingRepair',label:'虹膜调色',group:'eyes',status:'iris-editing-status'},
 'red-eye':{method:'redEyeRepair',label:'红眼消除',group:'eyes',status:'red-eye-status'},
 'lip-wrinkle':{method:'lipWrinkleRepair',label:'淡化唇纹',group:'lip',status:'lip-wrinkle-status'},
 'skin-unify':{method:'skinUnifyRepair',label:'肤色统一',group:'unify',status:'skin-unify-status'},
 'hair-smooth':{method:'hairSmoothRepair',label:'发丝柔顺',group:'hair',status:'hair-smooth-status'},
 'white-hair':{method:'whiteHairRepair',label:'去白发',group:'hair',status:'white-hair-status'},
 reference:{method:'skinReference',label:'参考肤色',group:'reference',status:'reference-status'}
});
const imagePattern=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;
function number(value,max=100){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw Error('AI 效果参数超出范围');return value;}
function record(value){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('AI 效果设置损坏');return value;}
function stage(input,{portableReference=false}={}){
 record(input);if(!Object.hasOwn(EFFECTS,input.kind))throw Error('未知的 AI 效果');const o=record(input.options);let options;
 if(input.kind==='reference')options=normalizeReferenceEffect(o,{portable:portableReference});
 else if(input.kind==='portrait'){
  const s=record(o.strengths);if(typeof s.removeNevi!=='boolean')throw Error('净肤效果参数无效');
  options={strengths:{blemish:number(s.blemish,1),acne:number(s.acne,1),freckle:number(s.freckle,1),removeNevi:s.removeNevi}};
 }else if(input.kind==='white-hair'){if(o.grayMass!==undefined&&typeof o.grayMass!=='boolean')throw Error('去白发模式参数无效');options={strengthPercent:number(o.strengthPercent),grayMass:o.grayMass??false};}
 else if(input.kind==='iris-editing'){if(Object.keys(o).some(k=>!['leftPercent','rightPercent','hueDegrees','saturationPercent'].includes(k)))throw Error('虹膜参数无效');options={leftPercent:number(o.leftPercent),rightPercent:number(o.rightPercent),hueDegrees:number(o.hueDegrees,360),saturationPercent:number(o.saturationPercent)};}
 else if(input.kind==='red-eye'){if(Object.keys(o).some(k=>k!=='strengthPercent'))throw Error('红眼参数无效');options={strengthPercent:number(o.strengthPercent)};}
 else if(input.kind==='hair-smooth')options={smoothPercent:number(o.smoothPercent),detailPercent:number(o.detailPercent)};
 else if(input.kind==='wrinkle')options=o.regionsPercent!==undefined?{regionsPercent:Object.fromEntries(regions.map(r=>[r.flag,number(record(o.regionsPercent)[r.flag])]))}:{strength:number(o.strength,1)};
 else if(input.kind==='eye-bag')options={primaryPercent:number(o.primaryPercent),secondaryPercent:number(o.secondaryPercent)};
 else options={strengthPercent:number(o.strengthPercent)};
 return {kind:input.kind,options};
}
function enabled(s){const o=s.options;return s.kind==='iris-editing'?o.leftPercent>0||o.rightPercent>0:s.kind==='reference'?o.intensity>0:s.kind==='hair-smooth'?o.smoothPercent>0||o.detailPercent>0:s.kind==='portrait'?Object.values(o.strengths).some(Boolean):s.kind==='wrinkle'?(o.regionsPercent?Object.values(o.regionsPercent).some(v=>Math.fround(v/100)>Math.fround(.001)):o.strength>0):s.kind==='eye-bag'?o.primaryPercent>0:o.strengthPercent>0;}
export function normalizeEffectStages(input=[],options={}){
 if(!Array.isArray(input)||input.length>Object.keys(EFFECTS).length)throw Error('AI 效果列表损坏');const result=input.map(s=>stage(s,options)),seen=new Set();
 for(const s of result){if(seen.has(s.kind))throw Error('AI 效果重复');seen.add(s.kind);}
 return result.filter(enabled);
}
// 工程只嵌入当前结果和可重算设置，不存储运行缓存或任意外部路径。
export function normalizeEffectState(input){
 if(input==null)return null;record(input);const stages=normalizeEffectStages(input.stages);
 if(input.version!==1||!stages.length||typeof input.image!=='string'||!imagePattern.test(input.image))throw Error('AI 效果图像或版本损坏');
 return {version:1,stages,image:input.image};
}
export function replaceEffect(input,next){
 const stages=normalizeEffectStages(input),replacement=stage(next),index=stages.findIndex(s=>s.kind===next.kind);
 if(index<0)stages.push(replacement);else stages[index]=replacement;
 return stages.filter(enabled);
}
export function syncEffectStages(target,source,groups,{changedOnly=false}={}){
 const previous=normalizeEffectStages(target),incoming=normalizeEffectStages(source).filter(s=>groups.includes(EFFECTS[s.kind].group));
 const replaced=new Set(changedOnly?incoming.map(s=>s.kind):Object.keys(EFFECTS).filter(kind=>groups.includes(EFFECTS[kind].group)));
 const first=previous.findIndex(s=>replaced.has(s.kind)),result=previous.filter(s=>!replaced.has(s.kind));
 result.splice(first<0?result.length:first,0,...incoming);
 return result;
}
// 同步配方时也同步其完整控制值，包含处于默认值的次级参数。
export function alignEffectParams(params,stages,groups,{clearMissing=false}={}){
 const result={...params};
 for(const [kind,spec] of Object.entries(EFFECTS))if(groups.includes(spec.group)&&!['portrait','reference'].includes(kind)){
  const s=stages.find(item=>item.kind===kind),o=s?.options;
  if(!s&&!clearMissing)continue;
  if(kind==='wrinkle'){
   if(o?.regionsPercent){result.wrinkleMode=1;for(const r of regions)result[r.key]=o.regionsPercent[r.flag];}
   else {result.wrinkleMode=0;result.wrinkleStrength=o?Math.round(o.strength*1e8)/1e6:0;if(!o)for(const r of regions)result[r.key]=0;}
  }else if(kind==='hair-smooth'){result.hairSmoothStrength=o?.smoothPercent??0;result.hairDetailStrength=o?.detailPercent??0;}
  else if(kind==='iris-editing'){result.irisLeftStrength=o?.leftPercent??0;result.irisRightStrength=o?.rightPercent??0;if(o){result.irisHue=o.hueDegrees;result.irisSaturation=o.saturationPercent;}}
  else if(kind==='white-hair'){result.whiteHairStrength=o?.strengthPercent??0;if(o)result.whiteHairMode=o.grayMass?1:0;}
  else if(kind==='eye-bag'){result.eyeBagStrength=o?.primaryPercent??0;if(o)result.eyeBagKeep=o.secondaryPercent;}
  else result[{'red-eye':'redEyeStrength','dark-circles':'darkCirclesStrength','lip-wrinkle':'lipWrinkleStrength','skin-unify':'skinUnifyStrength'}[kind]]=o?.strengthPercent??0;
 }
 return result;
}
// 从不可变原图开始，复用未改变的前缀；更改上游时重算全部下游。
export async function renderEffectStack({source,stages,run,cache}){
 if(typeof source!=='string'||!imagePattern.test(source))throw Error('AI 效果原图无效');
 const normalized=normalizeEffectStages(stages),steps=[];let image=source,reusable=cache?.source===source;
 for(let i=0;i<normalized.length;i++){
  const current=normalized[i],old=cache?.steps?.[i];
  reusable=reusable&&old&&JSON.stringify(old.stage)===JSON.stringify(current);
  if(reusable){image=old.image;steps.push(old);continue;}
  const result=await run(current.kind,image,structuredClone(current.options));
  const reference=current.kind==='reference',hair=['hair-smooth','white-hair'].includes(current.kind),count=hair?result?.processedRegions:result?.processedFaces;
  if(reference?(!Number.isSafeInteger(result?.changedRGBFields)||result.changedRGBFields<0):(!Number.isInteger(count)||count<0))throw Error('效果处理结果无效');
  if(['red-eye','iris-editing'].includes(current.kind)&&(!Number.isInteger(result.processedEyes)||result.processedEyes<0||result.processedEyes>16||count>8||result.processedEyes<count||result.processedEyes>count*2||!Number.isSafeInteger(result.changedRGBFields)||result.changedRGBFields<0||(result.processedEyes===0)!==(result.changedRGBFields===0)))throw Error(EFFECTS[current.kind].label+'处理结果无效');
  if(reference||count){
   if(typeof result.png!=='string'||!result.png.length||!/^[A-Za-z0-9+/=\s]+$/.test(result.png))throw Error('AI 效果返回的图像无效');
   image='data:image/png;base64,'+result.png;
  }
  const report=reference?{changedRGBFields:result.changedRGBFields}:hair?{processedRegions:count,detectedRegions:result.detectedRegions??count,changedRGBFields:result.changedRGBFields}:{processedFaces:count,detectedFaces:result.detectedFaces??count};
  if(['red-eye','iris-editing'].includes(current.kind))Object.assign(report,{processedEyes:result.processedEyes,changedRGBFields:result.changedRGBFields});
  steps.push({stage:current,image,report});
 }
 return {stages:normalized,image,reports:steps.map(s=>({kind:s.stage.kind,...s.report})),cache:{source,steps}};
}
