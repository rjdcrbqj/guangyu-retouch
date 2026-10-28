const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/hair-input.json');
let pack;
try{pack=require('../inference/hair-smooth/input.cjs').packPreparedHairInput;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('头发输入：12组图层经36次原转换与归一化后的浮点字节一致',()=>{
 assert.equal(typeof pack,'function');
 for(const row of fixture.cases){
  const pixels=Buffer.from(row.pixels,'hex'),mask=Buffer.from(row.mask,'hex');
  const packed=pack({...row,pixels,mask});
  assert.deepEqual(packed.dims,[1,4,row.height,row.width]);
  assert.equal(Buffer.from(packed.data.buffer,packed.data.byteOffset,packed.data.byteLength).toString('hex'),row.originalHex,row.name);
  assert.equal(pixels.toString('hex'),row.pixels);assert.equal(mask.toString('hex'),row.mask);
 }
});

test('头发输入：第四通道保留0至255蒙版，不做颜色归一化',()=>{
 assert.equal(typeof pack,'function');
 const packed=pack({pixels:Uint8Array.from([0,127,255,128,254,1]),mask:Uint8Array.from([0,255]),width:2,height:1,channels:3});
 assert.deepEqual(Array.from(packed.data.slice(6)),[0,255]);
});
