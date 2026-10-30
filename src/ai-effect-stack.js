import regions from './wrinkle-region-contract.js';

export const EFFECTS=Object.freeze({
 portrait:{method:'portraitRepair',label:'净肤',group:'skin',status:'repair-status'},
 wrinkle:{method:'wrinkleRepair',label:'祛皱',group:'wrinkle',status:'wrinkle-status'},
 'eye-bag':{method:'eyeBagRepair',label:'去眼袋',group:'eyes',status:'eye-bag-status'},
 'dark-circles':{method:'darkCirclesRepair',label:'祛黑眼圈',group:'eyes',status:'dark-circles-status'},
 'lip-wrinkle':{method:'lipWrinkleRepair',label:'淡化唇纹',group:'lip',status:'lip-wrinkle-status'},
 'skin-unify':{method:'skinUnifyRepair',label:'肤色统一',group:'unify',status:'skin-unify-status'}
});
const imagePattern=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;
function number(value,max=100){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw Error('AI 效果参数超出范围');return value;}
function record(value){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('AI 效果设置损坏');return value;}
function stage(input){
 record(input);if(!Object.hasOwn(EFFECTS,input.kind))throw Error('未知的 AI 效果');const o=record(input.options);let options;
 if(input.kind==='portrait'){
  const s=record(o.strengths);if(typeof s.removeNevi!=='boolean')throw Error('净肤效果参数无效');
  options={strengths:{blemish:number(s.blemish,1),acne:number(s.acne,1),freckle:number(s.freckle,1),removeNevi:s.removeNevi}};
 }else if(input.kind==='wrinkle')options=o.regionsPercent!==undefined?{regionsPercent:Object.fromEntries(regions.map(r=>[r.flag,number(record(o.regionsPercent)[r.flag])]))}:{strength:number(o.strength,1)};
 else if(input.kind==='eye-bag')options={primaryPercent:number(o.primaryPercent),secondaryPercent:number(o.secondaryPercent)};
 else options={strengthPercent:number(o.strengthPercent)};
 return {kind:input.kind,options};
}
function enabled(s){const o=s.options;return s.kind==='portrait'?Object.values(o.strengths).some(Boolean):s.kind==='wrinkle'?(o.regionsPercent?Object.values(o.regionsPercent).some(v=>Math.fround(v/100)>Math.fround(.001)):o.strength>0):s.kind==='eye-bag'?o.primaryPercent>0:o.strengthPercent>0;}
export function normalizeEffectStages(input=[]){
 if(!Array.isArray(input)||input.length>6)throw Error('AI 效果列表损坏');const result=input.map(stage),seen=new Set();
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
 for(const [kind,spec] of Object.entries(EFFECTS))if(groups.includes(spec.group)&&kind!=='portrait'){
  const s=stages.find(item=>item.kind===kind),o=s?.options;
  if(!s&&!clearMissing)continue;
  if(kind==='wrinkle'){
   if(o?.regionsPercent){result.wrinkleMode=1;for(const r of regions)result[r.key]=o.regionsPercent[r.flag];}
   else {result.wrinkleMode=0;result.wrinkleStrength=o?Math.round(o.strength*1e8)/1e6:0;if(!o)for(const r of regions)result[r.key]=0;}
  }else if(kind==='eye-bag'){result.eyeBagStrength=o?.primaryPercent??0;if(o)result.eyeBagKeep=o.secondaryPercent;}
  else result[{'dark-circles':'darkCirclesStrength','lip-wrinkle':'lipWrinkleStrength','skin-unify':'skinUnifyStrength'}[kind]]=o?.strengthPercent??0;
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
  if(!Number.isInteger(result?.processedFaces)||result.processedFaces<0)throw Error('AI 效果返回的人脸数量无效');
  if(result.processedFaces){
   if(typeof result.png!=='string'||!result.png.length||!/^[A-Za-z0-9+/=\s]+$/.test(result.png))throw Error('AI 效果返回的图像无效');
   image='data:image/png;base64,'+result.png;
  }
  const report={processedFaces:result.processedFaces,detectedFaces:result.detectedFaces??result.processedFaces};
  steps.push({stage:current,image,report});
 }
 return {stages:normalized,image,reports:steps.map(s=>({kind:s.stage.kind,...s.report})),cache:{source,steps}};
}
