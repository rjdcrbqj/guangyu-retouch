import {normalizeReferenceState} from './reference-skin-state.js';

// 一次参考效果独立保存取色供给和作用选区，后续改选区不改变已应用效果。
export function normalizeReferenceEffect(value,{portable=false}={}){
 if(!value||typeof value!=='object'||!Number.isFinite(value.intensity)||value.intensity<0||value.intensity>1)throw Error('参考强度必须在 0–1 之间');
 const reference=normalizeReferenceState(value.reference);
 if(!reference?.image||reference.width!==64||reference.height!==64||!reference.maskCrop||!reference.image.startsWith('data:image/png;base64,')||reference.image.length>65536)throw Error('参考效果缺少完整的 64×64 取色图与参考蒙版');
 const result={intensity:value.intensity,reference};
 if(portable){if(value.selection!==undefined)throw Error('参考预设不能携带源照片的作用选区');return result;}
 const s=value.selection;
 if(!s||![s.width,s.height].every(n=>Number.isInteger(n)&&n>=2&&n<=1600)||typeof s.image!=='string'||s.image.length>16*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(s.image))throw Error('参考效果的作用选区缺失或损坏');
 return {...result,selection:{image:s.image,width:s.width,height:s.height}};
}

// 同步与预设沿用目标照片自己的皮肤选区，不复制源照片的空间位置。
export function bindReferenceSelection(stages,selection){
 return stages.map(s=>s.kind==='reference'?{kind:s.kind,options:normalizeReferenceEffect({...s.options,reference:{...s.options.reference,pickPoint:null},selection})}:s);
}
