'use strict';
// 对应 LIVE 140a1f750：普通取色的真实 cap 解析。
// 原版顺序：先查首NUL键 Preview_Size 得候选A，A>0 即选A；
// 否则请求回填候选B，B>0 即选B；否则读另一对象 +0x50 为候选C。
// 它不比较候选大小，只取第一个正值。最后 cmp 0x801 / mov 0x7d0 / cmovge：
//   cap = candidate >= 2049 ? candidate : 2000
// 候选值必须由调用方显式供应；本模块不读配置、不制造默认 cap。
const maxDimLimit=32766;
const slots=["primary","secondary","tertiary"];

// 返回 {usable:boolean, value:number|null}；空串/null/undefined 视为该槽不可用。
function parseCandidate(slot,v){
 if(v===undefined||v===null)return {usable:false,value:null};
 if(typeof v==="number"){
  if(!Number.isInteger(v))throw TypeError(slot+" 候选必须是整数或十进制字符串");
  return {usable:true,value:v};
 }
 if(typeof v!=="string")throw TypeError(slot+" 候选必须是整数或十进制字符串");
 const t=v.trim();
 if(t==="")return {usable:false,value:null};
 if(!/^[+-]?\d+$/.test(t))throw TypeError(slot+" 候选必须是整数或十进制字符串");
 return {usable:true,value:Number(t)};
}

function resolveSuppliedPickerCap(supplies){
 if(supplies===null||typeof supplies!=="object")throw TypeError("cap 解析需要显式供应候选槽");
 // undefined 视为未提供该槽；null 表示显式声明"该槽不可用"。
 const supplied=s=>Object.prototype.hasOwnProperty.call(supplies,s)&&supplies[s]!==undefined;
 if(!slots.some(supplied))throw TypeError("cap 解析至少需要一个候选槽");
 let candidate=null,source=null;
 for(const slot of slots){
  if(!supplied(slot))continue;
  const {usable,value}=parseCandidate(slot,supplies[slot]);
  if(usable&&value>0){candidate=value;source=slot;break;}
 }
 // 候选越界：只有在真正被选中时才判范围，避免用无关槽触发错误。
 if(candidate!==null&&(candidate>maxDimLimit||candidate<-2147483648||candidate>2147483647))
  throw RangeError("cap 候选超出可接受范围");
 // 原版无正值候选时输出常量 2000；标记为 floor，不伪装成候选。
 if(candidate===null)return {cap:2000,source:"floor"};
 return {cap:candidate>=2049?candidate:2000,source};
}

module.exports={resolveSuppliedPickerCap};
