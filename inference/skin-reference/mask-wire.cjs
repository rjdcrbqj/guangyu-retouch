'use strict';

// 原144428060内层transport的显式供给子集；不识别外层缓存/服务，不隐含任何codec。
// 先核完整结构，再执行同步decodeImage；安全边界不声称等同原FlatBuffers verifier。
function decodeSuppliedReferenceMaskPacket({data,decodeImage,previous={instanceMasks:[],typedMasks:new Map()}}={}){
 if(!(data instanceof Uint8Array)||data.length<5||data.length>64*1024*1024||typeof decodeImage!=='function'||
  !previous||!Array.isArray(previous.instanceMasks)||!(previous.typedMasks instanceof Map))throw TypeError('编码蒙版包需要有界BYTE、明确codec和既有目的对象');
 const bytes=new Uint8Array(data),view=new DataView(bytes.buffer);
 function span(p,n,alignment=1){
  if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p%alignment!==0||p+n>bytes.length)throw RangeError('编码蒙版结构越界或对齐无效');
  return p;
 }
 const u16=p=>view.getUint16(span(p,2,2),true),u32=p=>view.getUint32(span(p,4,4),true),i32=p=>view.getInt32(span(p,4,4),true);
 function table(t){
  const distance=i32(t);if(distance===0)throw RangeError('编码蒙版vtable距离为零');
  const v=t-distance,size=u16(v),objectSize=u16(v+2);
  if(size<4||size%2!==0||objectSize<4)throw RangeError('编码蒙版表头无效');
  span(v,size,2);span(t,objectSize,4);
  return (slot,n,required=false)=>{
   const offset=slot+2<=size?u16(v+slot):0;
   if(offset===0){if(required)throw RangeError('编码蒙版缺少必需字段');return null;}
   if(offset<4||offset+n>objectSize)throw RangeError('编码蒙版字段超出object');
   return span(t+offset,n,4);
  };
 }
 function indirect(p){const offset=u32(p);if(offset===0)throw RangeError('编码蒙版相对指针为零');return span(p+offset,4,4);}
 function vector(p,unit,max){
  const v=indirect(p),count=u32(v);if(count>max)throw RangeError('编码蒙版vector超出供给范围');
  span(v+4,count*unit,unit===4?4:1);return {start:v+4,count};
 }
 function item(t){
  const field=table(t),encodedField=field(4,4),wh=field(6,8,true),rect=field(8,16,true),key=field(12,4);
  field(10,4); // 仅核可选scalar布局；它在原赋值路径被忽略。
  // descriptor只视图引用私有transport，避免共享vector按引用次数放大内存；codec调用时再独立复制。
  const encoded=encodedField===null?new Uint8Array():(()=>{const v=vector(encodedField,1,bytes.length);return bytes.subarray(v.start,v.start+v.count);})();
  return {encoded,fullWH:[i32(wh),i32(wh+4)],origin:[i32(rect),i32(rect+4)],rawKey:key===null?0:i32(key),hasEncoded:encodedField!==null};
 }
 function list(field){
  if(field===null)return [];
  const v=vector(field,4,10000),records=[];
  for(let n=0;n<v.count;n++)records.push(item(indirect(v.start+n*4)));
  return records;
 }
 const root=u32(0);if(root<1||root>0x7fffffff)throw RangeError('编码蒙版root无效');
 const field=table(root),first=list(field(4,4)),typed=list(field(6,4));
 if(first.some(r=>!r.hasEncoded))throw RangeError('实例记录缺少编码BYTE vector');
 const instanceMasks=previous.instanceMasks.slice(),typedMasks=new Map(previous.typedMasks);
 if(first.length===0)return {instanceMasks,typedMasks}; // 原first-list空门在typed处理之前。
 function decode(record){
  const result=decodeImage(new Uint8Array(record.encoded));
  if(!result||typeof result!=='object'||typeof result.then==='function'||!Number.isInteger(result.status))throw TypeError('蒙版codec需要同步status/image结果');
  if(result.status!==0)return null;
  const image=result.image==null?null:structuredClone(result.image);
  if(image!==null){
   if(!ArrayBuffer.isView(result.image.data)||result.image.data instanceof DataView)throw TypeError('蒙版codec需要明确单平面typed data');
   const input=result.image.data;
   image.data=input instanceof Uint8Array?new Uint8Array(input):new input.constructor(input); // 新图数据私有，保留实际depth/channel声明。
  }
  return {fullWH:record.fullWH,origin:record.origin,rawKey:record.rawKey,image};
 }
 for(const record of first){const decoded=decode(record);if(decoded!==null)instanceMasks.push(decoded);}
 for(const record of typed)if(record.encoded.length!==0){const decoded=decode(record);if(decoded!==null)typedMasks.set(record.rawKey,decoded);}
 return {instanceMasks,typedMasks};
}
module.exports={decodeSuppliedReferenceMaskPacket};
