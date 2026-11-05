'use strict';
const f=Math.fround;
function finite(value,name){if(typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(f(value)))throw new TypeError(name+' must be a finite FLOAT-representable number');return value;}
// Original registered DOUBLE normalization; final F32 storage is an explicit
// product adapter. Whole original asynchronous UI-to-model write is unexecuted.
function fromUI({primaryPercent,secondaryPercent}){
 for(const [name,v]of Object.entries({primaryPercent,secondaryPercent})){finite(v,name);if(v<0||v>100)throw new RangeError(name+' outside original registered0..100');}
 return {primaryStrength:f((primaryPercent-0)/(100-0)),secondaryStrength:f((secondaryPercent-0)/(100-0))};
}
function handlerControls({primaryStrength,secondaryStrength}){
 const p=f(finite(primaryStrength,'primaryStrength')),s=f(finite(secondaryStrength,'secondaryStrength'));
 const primaryEnabled=p>0.001,secondaryEnabled=primaryEnabled&&s>0.001;
 return {primaryEnabled,secondaryEnabled,primaryStrength:primaryEnabled?p:0,secondaryStrength:secondaryEnabled?s:0};
}
module.exports={fromUI,handlerControls};
