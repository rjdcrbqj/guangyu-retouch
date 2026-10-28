const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/hair-bridge.json');
let blend;
try{blend=require('../inference/hair-smooth/bridge.cjs').blendPreparedHairInput;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('头发模型串联：63组标量与SSE混合输出逐字节匹配原函数',()=>{
 assert.equal(typeof blend,'function');
 for(const row of fixture.cases){
  const image=Buffer.from(row.image,'hex'),smooth=Buffer.from(row.smooth,'hex'),alpha=Buffer.from(row.alpha,'hex');
  const output=blend({...row,image,smooth,alpha});
  assert.equal(Buffer.from(output).toString('hex'),row.originalHex,row.name);
  assert.equal(image.toString('hex'),row.image);assert.equal(smooth.toString('hex'),row.smooth);assert.equal(alpha.toString('hex'),row.alpha);
 }
});

test('头发模型串联：保留RGBA透明度，零蒙版与区域后的字节不变',()=>{
 assert.equal(typeof blend,'function');
 const output=blend({image:Uint8Array.from([10,20,30,42,80,90,100,43,77]),smooth:Uint8Array.from([200,200,200,0,0,0]),alpha:Uint8Array.from([0,255]),width:2,height:1,channels:4});
 assert.deepEqual(Array.from(output),[10,20,30,42,0,0,0,43,77]);
});

test('头发模型串联：拒绝不完整图层和未复原的加速通道组合',()=>{
 assert.equal(typeof blend,'function');
 const input={image:new Uint8Array(4),smooth:new Uint8Array(3),alpha:new Uint8Array(1),width:1,height:1,channels:4};
 assert.throws(()=>blend({...input,branch:'sse41'}),RangeError);
 assert.throws(()=>blend({...input,alpha:new Uint8Array(0)}),RangeError);
 assert.throws(()=>blend({...input,width:-1}),RangeError);
 assert.throws(()=>blend({...input,width:0x100000000,height:0x100000000}),RangeError);
});
