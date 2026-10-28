'use strict';
const regions=require('../src/wrinkle-region-contract.json');
// Recovered property→raw-slot contract. This percent boundary is our own UI bridge;
// the original asynchronous normalized-F32 current-map store remains unverified.
function resolveWrinkleStrengths({strength=.5,regionsPercent}={}){
 if(regionsPercent===undefined){
  if(!Number.isFinite(strength)||strength<=0||strength>1)throw new Error('祛皱强度必须大于0且不超过1');
  return {mode:'overall',strengths:new Array(10).fill(strength),enabled:new Array(10).fill(strength>Math.fround(.001))};
 }
 if(!regionsPercent||typeof regionsPercent!=='object'||Array.isArray(regionsPercent)||![Object.prototype,null].includes(Object.getPrototypeOf(regionsPercent)))throw new Error('祛皱分区参数无效');
 const flags=regions.map(r=>String(r.flag));
 if(Object.keys(regionsPercent).some(k=>!flags.includes(k)))throw new Error('祛皱分区包含不支持的属性');
 const strengths=new Array(10).fill(0),percentages={};
 for(const r of regions){
  const value=Object.hasOwn(regionsPercent,r.flag)?regionsPercent[r.flag]:0;
  if(!Number.isFinite(value)||value<0||value>100)throw new Error('祛皱分区强度必须在0–100之间');
  percentages[r.flag]=value;
  for(const slot of r.slots)strengths[slot]=Math.fround(value/100);
 }
 const enabled=strengths.map(v=>v>Math.fround(.001));
 if(!enabled.some(Boolean))throw new Error('请先增加至少一个祛皱分区的强度');
 return {mode:'regions',strengths,enabled,regionsPercent:percentages};
}
module.exports={resolveWrinkleStrengths};
