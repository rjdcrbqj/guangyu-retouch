const test=require('node:test'),assert=require('node:assert/strict');
let pack;try{pack=require('../inference/tooth-repair/input.cjs').packPreparedToothRepairInputs;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const floats=hex=>{const b=Buffer.from(hex,'hex');return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
test('牙齿修复输入：颜色归一化、独立浮点辅助输入、行距与透明度',()=>{
 assert.equal(typeof pack,'function');const row=require('./fixtures/tooth-io-static.json').input,input={...row,pixels:Buffer.from(row.pixels,'hex'),auxiliary:{...row.auxiliary,data:floats(row.auxiliary.data)}};
 const out=pack(input);assert.deepEqual(out.image.dims,[1,3,row.height,row.width]);assert.deepEqual(out.auxiliary.dims,[1,1,row.auxiliary.height,row.auxiliary.width]);assert.equal(Buffer.from(out.image.data.buffer).toString('hex'),row.expectedImage);assert.equal(Buffer.from(out.auxiliary.data.buffer).toString('hex'),row.expectedAuxiliary);
 input.pixels.fill(0);input.auxiliary.data.fill(0);assert.equal(Buffer.from(out.auxiliary.data.buffer).toString('hex'),row.expectedAuxiliary);
});
test('牙齿修复输入：拒绝错误长度、行距和非有限辅助值',()=>{
 assert.equal(typeof pack,'function');const base={pixels:new Uint8Array(6),width:2,height:1,auxiliary:{data:new Float32Array(1),width:1,height:1}};
 for(const patch of [{channels:2},{stride:1},{pixels:new Uint8Array(5)},{auxiliary:{...base.auxiliary,data:new Float32Array([NaN])}},{auxiliary:{...base.auxiliary,data:new Uint8Array(1)}}])assert.throws(()=>pack({...base,...patch}),RangeError);
});
