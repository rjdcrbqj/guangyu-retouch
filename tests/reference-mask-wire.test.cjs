'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function api(){return require('../inference/skin-reference/mask-wire.cjs').decodeSuppliedReferenceMaskPacket;}
// 独立合成transport，不读实际缓存或旧成功fixture。
function packet(first,typed){
 const b=Buffer.alloc(16384);let end=4;
 function alloc(n,alignment=4){end=Math.ceil(end/alignment)*alignment;const p=end;end+=n;return p;}
 function table(fields,size){const vt=alloc(4+fields.length*2,2);b.writeUInt16LE(4+fields.length*2,vt);b.writeUInt16LE(size,vt+2);
  fields.forEach((v,i)=>b.writeUInt16LE(v,vt+4+i*2));const t=alloc(size);b.writeInt32LE(t-vt,t);return t;}
 function item(r){const t=table([4,8,16,32,r.key===undefined?0:36],40);
  (r.fullWH||[13,11]).forEach((v,i)=>b.writeInt32LE(v,t+8+i*4));
  (r.rect||[4,3,901,902]).forEach((v,i)=>b.writeInt32LE(v,t+16+i*4));
  b.writeInt32LE(0x12345678,t+32);if(r.key!==undefined)b.writeInt32LE(r.key,t+36);
  const encoded=Uint8Array.from(r.bytes||[]),v=alloc(4+encoded.length);b.writeUInt32LE(encoded.length,v);b.set(encoded,v+4);b.writeUInt32LE(v-t-4,t+4);return t;}
 const root=table([first===undefined?0:4,8],12);b.writeUInt32LE(root,0);
 for(const [slot,list]of [[4,first],[8,typed]])if(list!==undefined){const v=alloc(4+list.length*4);b.writeUInt32LE(list.length,v);b.writeUInt32LE(v-root-slot,root+slot);
  list.forEach((r,i)=>{const loc=v+4+i*4,t=item(r);b.writeUInt32LE(t-loc,loc);});}
 return b.subarray(0,end);
}
function decoded(bytes){return {status:bytes[0]===250?1:0,image:{data:Uint8Array.of(bytes[0]||37,53),width:2,height:1,stride:2,channels:1}};}
test('内层两vector保留metadata；localWH来自decoder，rectWH不替代',()=>{
 const run=api(),data=packet([{bytes:[41],key:19}],[{bytes:[73],key:0,fullWH:[17,19],rect:[5,7,301,302]}]);
 const out=run({data,decodeImage:decoded});
 assert.equal(out.instanceMasks.length,1);assert.equal(out.instanceMasks[0].rawKey,19);
 const r=out.typedMasks.get(0);assert.deepEqual(r.fullWH,[17,19]);assert.deepEqual(r.origin,[5,7]);
 assert.deepEqual([r.image.width,r.image.height,r.image.stride],[2,1,2]);assert.deepEqual(Array.from(r.image.data),[73,53]);
});
test('first vector缺失或空时跳过typed解码，保留旧数组与Map条目',()=>{
 const run=api(),old={fullWH:[3,3],origin:[0,0],image:null},previous={instanceMasks:[old],typedMasks:new Map([[0,old]])};
 for(const first of [undefined,[]]){let calls=0;const out=run({data:packet(first,[{bytes:[99],key:0}]),previous,decodeImage(){calls++;return decoded(Uint8Array.of(99));}});
  assert.equal(calls,0);assert.deepEqual(out.instanceMasks,[old]);assert.equal(out.typedMasks.get(0),old);
  assert.notEqual(out.instanceMasks,previous.instanceMasks);assert.notEqual(out.typedMasks,previous.typedMasks);}
});
test('实例解码失败不阻断typed；成功append、重复键只由后续成功项覆盖',()=>{
 const run=api(),old={image:null},previous={instanceMasks:[old],typedMasks:new Map([[0,old],[8,old]])};
 const data=packet([{bytes:[250],key:1},{bytes:[31],key:2}],
  [{bytes:[61],key:0},{bytes:[67],key:0},{bytes:[250],key:0},{bytes:[250],key:8},{bytes:[79],key:-7}]);
 const out=run({data,previous,decodeImage:decoded});
 assert.equal(out.instanceMasks.length,2);assert.equal(out.instanceMasks[0],old);assert.equal(out.instanceMasks[1].rawKey,2);
 assert.equal(out.typedMasks.get(0).image.data[0],67);assert.equal(out.typedMasks.get(8),old);assert.equal(out.typedMasks.get(-7).rawKey,-7);
 assert.equal(previous.instanceMasks.length,1);assert.equal(previous.typedMasks.get(0),old);
 const failOnly=run({data:packet([{bytes:[250]}],[{bytes:[83],key:0}]),decodeImage:decoded});
 assert.equal(failOnly.instanceMasks.length,0);assert.equal(failOnly.typedMasks.get(0).image.data[0],83);
});
test('缺失key默认0；typed空encoded跳过，instance空encoded仍交给decoder',()=>{
 const run=api(),seen=[];
 const out=run({data:packet([{bytes:[]}],[{bytes:[],key:9},{bytes:[89]}]),decodeImage(bytes){seen.push(Array.from(bytes));return decoded(bytes);}});
 assert.deepEqual(seen,[[],[89]]);assert.equal(out.instanceMasks.length,1);assert.equal(out.typedMasks.size,1);assert.equal(out.typedMasks.get(0).rawKey,0);
});
test('解码器显式供应格式，彩色不偷偷转灰；新data独立复制',()=>{
 const run=api(),pixels=Uint8Array.of(3,11,29,47,71,97);
 const out=run({data:packet([{bytes:[1]}],[{bytes:[2],key:0}]),decodeImage(){return {status:0,image:{data:pixels,width:2,height:1,stride:6,channels:3,format:301}};}});
 const image=out.typedMasks.get(0).image;assert.equal(image.channels,3);assert.equal(image.format,301);assert.deepEqual(image.data,pixels);
 pixels.fill(0);assert.deepEqual(Array.from(image.data),[3,11,29,47,71,97]);
 const select=require('../inference/skin-reference/mask-record.cjs').selectSuppliedReferenceMask;
 assert.throws(()=>select({...out,math:'native-u8-roi-copy'}));
});
test('transport和callback字节互不污染，typed0可直接进入既有记录选路',()=>{
 const run=api(),data=packet([{bytes:[5]}],[{bytes:[101],key:0,fullWH:[4,3],rect:[1,1,901,902]}]),before=Buffer.from(data);let calls=0;
 const out=run({data,decodeImage(bytes){const result=decoded(bytes);calls++;bytes.fill(0);if(calls===1)data.fill(0);return result;}});
 assert.equal(calls,2);assert.equal(out.typedMasks.get(0).image.data[0],101);
 const mask=require('../inference/skin-reference/mask-record.cjs').selectSuppliedReferenceMask({...out,math:'native-u8-roi-copy'});
 assert.deepEqual(Array.from(mask.data),[0,0,0,0,0,101,53,0,0,0,0,0]);assert.ok(before.some(v=>v!==0));
});
test('越界/截断/无效offset和异步codec拒绝，结构错误不调用codec',()=>{
 const run=api(),good=packet([{bytes:[13]}],[{bytes:[17],key:0}]);
 const invalid=[new Uint8Array(),good.subarray(0,good.length-1),Buffer.from(good),Buffer.from(good)];
 invalid[2].writeUInt32LE(0xfffffffc,0);const root=invalid[3].readUInt32LE(0);invalid[3].writeInt32LE(0,root);
 for(const data of invalid){let calls=0;assert.throws(()=>run({data,decodeImage(){calls++;return decoded(Uint8Array.of(5));}}));assert.equal(calls,0);}
 assert.throws(()=>run({data:good,decodeImage:async()=>decoded(Uint8Array.of(5))}));
 assert.throws(()=>run({data:good}));assert.throws(()=>run({data:new Float32Array(20),decodeImage:decoded}));
});
test('同一encoded vector被64次引用时，codec前不放大为64份payload',()=>{
 // 独立共享引用包：root12 / vector24 / item300 / payload340 / emptyTyped33112。
 const data=Buffer.alloc(33116),w16=(p,n)=>data.writeUInt16LE(n,p),w32=(p,n)=>data.writeUInt32LE(n,p);
 w32(0,12);[8,12,4,8].forEach((v,i)=>w16(4+i*2,v));w32(12,8);w32(16,8);w32(20,33092);
 w32(24,64);for(let n=0;n<64;n++)w32(28+n*4,300-(28+n*4));
 [14,40,4,8,16,32,36].forEach((v,i)=>w16(284+i*2,v));w32(300,16);w32(304,36);
 w32(308,1);w32(312,1);w32(340,32768);data.fill(17,344,33112);w32(33112,0);
 const run=api(),before=process.memoryUsage().arrayBuffers;let calls=0;
 const out=run({data,decodeImage(bytes){calls++;if(calls===1)assert.ok(process.memoryUsage().arrayBuffers-before<1024*1024,'共享vector不能在codec前复制64份');
  assert.equal(bytes.length,32768);assert.equal(bytes[0],17);bytes[0]=0;return {status:1};}});
 assert.equal(calls,64);assert.equal(out.instanceMasks.length,0);assert.equal(data[344],17);
});
test('新合成灰PNG包经显式codec与记录选路进入现有作业，模型768与参考64保持独立',async()=>{
 const run=api(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAAAAAC4HznGAAAAEElEQVR4nGP4z9DA4HBAHgAL4AKfy3H8TAAAAABJRU5ErkJggg==','base64');
 const {decodeSuppliedGrayPNG}=require('../inference/skin-reference/gray-png.cjs');
 const decodedPacket=run({data:packet([{bytes:[0x19,0x27]}],[{bytes:png,key:0,fullWH:[6,4],rect:[2,1,77,88]}]),decodeImage(data){
  try{return {status:0,image:decodeSuppliedGrayPNG({data,policy:'encoded-gray8-no-metadata-transform'})};}catch{return {status:1};}
 }});
 assert.equal(decodedPacket.instanceMasks.length,0);assert.deepEqual(Array.from(decodedPacket.typedMasks.get(0).image.data),[255,0,128,64,192,31]);
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');let calls=0;
 const p=new SkinReferenceProcessor({models:{async run(input){calls++;
  const f=Math.fround,s=f(1/255);assert.equal(input.currentMask[770],1);assert.equal(input.currentMask[771],0);assert.equal(input.currentMask[772],f(128*s));
  assert.equal(input.currentMask[1538],f(64*s));assert.equal(input.currentMask[1539],f(192*s));assert.equal(input.currentMask[1540],f(31*s));assert.equal(input.currentMask[769],0);
  assert.equal(input.referenceMask[0],f(47*s));assert.equal(input.referenceMask[4095],f(47*s));
  return {coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)};
 },async close(){}}});
 const r={original:{data:new Uint8Array(72).fill(109),width:6,height:4,stride:18,channels:3},
  workingPhoto:{data:new Uint8Array(72).fill(109),width:6,height:4,stride:18,format:301},baseMask:{data:new Uint8Array(24).fill(255),width:6,height:4,stride:6},selectionSupply:decodedPacket,
  referencePhoto:{data:new Uint8Array(12288).fill(127),width:64,height:64,stride:192,format:301},referenceMask:{data:new Uint8Array(4096).fill(47),width:64,height:64,stride:64},
  geometry:{valid:true,inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0]),originalROI:Int32Array.from([0,0,2,2])},
  blendMask:new Uint8Array(4).fill(255),blendMaskStride:2,secondaryTestMask:new Uint8Array(4).fill(255),secondaryTestMaskStride:2,
  secondaryProtection:new Uint8Array(4).fill(255),secondaryProtectionStride:2,intensity:1,referenceRevision:38};
 const out=await p.run(r);assert.equal(calls,1);assert.equal(out.referenceRevision,38);assert.deepEqual(out.output,r.original.data);await p.close();
});
test('同一内层包的typed0供当前人脸，typed集合与aux1独立生成参考64再提交mock作业',async()=>{
 const run=api(),rows=[{bytes:[170],key:2},{bytes:[100],key:6},{bytes:[50],key:1},{bytes:[33],key:0}]
  .map(r=>({...r,fullWH:[6,4],rect:r.key===0?[1,1,99,98]:[0,0,99,98]}));
 const supply=run({data:packet([{bytes:[250]}],rows),decodeImage(bytes){
  if(bytes[0]===250)return {status:1};const width=bytes[0]===33?2:6,height=bytes[0]===33?2:4;
  return {status:0,image:{data:new Uint8Array(width*height).fill(bytes[0]),width,height,stride:width,channels:1}};
 }});
 const {prepareSuppliedTypedReferenceMask64}=require('../inference/skin-reference/typed-mask64.cjs');
 const reference=prepareSuppliedTypedReferenceMask64({typedMasks:supply.typedMasks,sourcePhotoWH:[1024,700],ratios:[0,0],rounding:'nearest-even',unmasked:true,math:'native-byte1-add-subtract-code1-code2-generic'});
 assert.equal(reference.source,'aggregate-minus-auxiliary');assert.ok(reference.mask.data.every(v=>v===205));
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');let calls=0;
 const p=new SkinReferenceProcessor({models:{async run(input){calls++;const f=Math.fround,s=f(1/255);
  assert.equal(input.currentMask[0],0);assert.equal(input.currentMask[769],f(33*s));assert.equal(input.currentMask[770],f(33*s));
  assert.equal(input.referenceMask[0],f(205*s));assert.equal(input.referenceMask[4095],f(205*s));
  return {coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)};
 },async close(){}}});
 const request={original:{data:new Uint8Array(72).fill(137),width:6,height:4,stride:18,channels:3},
  workingPhoto:{data:new Uint8Array(72).fill(137),width:6,height:4,stride:18,format:301},baseMask:{data:new Uint8Array(24).fill(255),width:6,height:4,stride:6},selectionSupply:supply,
  referencePhoto:{data:new Uint8Array(12288).fill(127),width:64,height:64,stride:192,format:301},referenceMask:reference.mask,
  geometry:{valid:true,inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0]),originalROI:Int32Array.from([0,0,2,2])},
  blendMask:new Uint8Array(4).fill(255),blendMaskStride:2,secondaryTestMask:new Uint8Array(4).fill(255),secondaryTestMaskStride:2,
  secondaryProtection:new Uint8Array(4).fill(255),secondaryProtectionStride:2,intensity:1,referenceRevision:41};
 const out=await p.run(request);assert.equal(calls,1);assert.equal(out.referenceRevision,41);assert.deepEqual(out.output,request.original.data);await p.close();
});
