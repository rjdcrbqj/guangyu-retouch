'use strict';
const ids=Object.freeze([5,6,7,8]);
function scoreID(scores,readStatus=0) {
  if (readStatus !== 0) return 7;
  if (!scores || scores.length !== 4) throw new Error('four supplied F32 scores required');
  let best=5, max=Math.fround(scores[0]);
  for(let i=1;i<4;i++) {
    const value=Math.fround(scores[i]);
    if(value>max) best=ids[i];
    // Original MAXSS keeps the prior operand for equal/unordered comparisons.
    max=value>max ? value : max;
  }
  return best;
}
function allChannelsWithin(source,threshold=10) {
  if(!(source instanceof Uint8Array) || source.length%3!==0) throw new Error('supplied BYTE301 required');
  for(let i=0;i<source.length;i+=3) {
    if(Math.max(source[i],source[i+1],source[i+2])-Math.min(source[i],source[i+1],source[i+2])>threshold) return false;
  }
  return true;
}
function suppliedState({nonempty,format1=false,cachedGray,flag13ca=false,flag13cb=false}) {
  if(!nonempty) return false;
  // No original resize/conversion is implied: cachedGray must be supplied.
  return format1 || !!cachedGray || ((Number(flag13ca) & Number(flag13cb)) !== 0);
}
function backendKey(id,imageState) {
  if(!ids.includes(id)) throw new Error('supported source IDs are 5 through 8');
  return id===6 || id===8 || imageState ? 1 : 0;
}
function readSuppliedScores(mapping,requests,{index=0,count=requests.length,nullKind=null}={}) {
  const out=new Uint8Array(Math.max(4,requests.length*4)).fill(0xcc),view=new DataView(out.buffer);
  if(index!==0 || count===0 || nullKind) return {status:0xffffffff,bytes:out};
  for(let i=0;i<count;i++) {
    if(!Object.hasOwn(mapping,requests[i])) return {status:0xffffffff,bytes:out};
    view.setUint32(i*4,mapping[requests[i]],true);
  }
  return {status:0,bytes:out};
}
module.exports={scoreID,allChannelsWithin,suppliedState,backendKey,readSuppliedScores};

// 缺失读取和真实模型错误由服务分开处理。
function select({scores,readStatus=0,state=false}){
 if(typeof state!=='boolean')throw Error('肤色统一图像状态无效');
 let values=null;
 if(readStatus===0){if(!scores||![5,6,7,8].every(k=>Object.hasOwn(scores,k)&&typeof scores[k]==='number'))throw Error('肤色统一属性数据缺失');values=[5,6,7,8].map(k=>scores[k]);}
 const classId=scoreID(values,readStatus);return {classId,key:backendKey(classId,state)};
}
module.exports.select=select;
