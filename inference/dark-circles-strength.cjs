'use strict';
const f=Math.fround,THRESHOLD=0.0010000000474974513;
function finite(value,name){if(typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(f(value)))throw new TypeError(name+' must be a finite FLOAT-representable number');return value;}
// Registered normalization is DOUBLE; the handler reads stored F32 unchanged.
function fromUI({strengthPercent}){finite(strengthPercent,'strengthPercent');if(strengthPercent<0||strengthPercent>100)throw new RangeError('strengthPercent outside original registered0..100');return {strength:f(strengthPercent/100)};}
function handlerControls({strength}){const v=f(finite(strength,'strength')),enabled=v>THRESHOLD;return {enabled,strength:enabled?v:0};}
module.exports={fromUI,handlerControls};
