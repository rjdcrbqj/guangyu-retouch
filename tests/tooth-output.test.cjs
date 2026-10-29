const test=require('node:test'),assert=require('node:assert/strict');
let decode;try{decode=require('../inference/tooth-repair/output.cjs').decodePreparedToothRepairOutput;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const floats=hex=>{const b=Buffer.from(hex,'hex');return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
test('牙齿修复缓存：严格浮点阈值、90%面积边界、颜色取偶与浮点透明度',()=>{
 assert.equal(typeof decode,'function');for(const row of require('./fixtures/tooth-io-static.json').cases){const image={data:floats(row.image),dims:[1,3,row.height,row.width]},alpha={data:floats(row.alpha),dims:[1,1,row.height,row.width]},out=decode({image,alpha});
  assert.deepEqual(out.cropRect,row.cropRect,row.name);assert.deepEqual(out.canvasWH,[row.width,row.height]);assert.deepEqual([out.width,out.height],row.cropRect.slice(2));assert.equal(Buffer.from(out.image).toString('hex'),row.expectedImage,row.name);assert.equal(Buffer.from(out.alpha.buffer).toString('hex'),row.expectedAlpha,row.name);assert.equal(Buffer.from(image.data.buffer).toString('hex'),row.image);assert.equal(Buffer.from(alpha.data.buffer).toString('hex'),row.alpha);
 }
});
test('牙齿修复缓存：拒绝错位网格、异常浮点数与长度不符',()=>{
 assert.equal(typeof decode,'function');const image={data:new Float32Array(6),dims:[1,3,1,2]},alpha={data:new Float32Array(2),dims:[1,1,1,2]};
 for(const patch of [{alpha:{...alpha,dims:[1,1,2,1]}},{image:{...image,data:new Float32Array([NaN,0,0,0,0,0])}},{alpha:{...alpha,data:new Float32Array(1)}},{image:{...image,dims:[1,4,1,2]}}])assert.throws(()=>decode({image,alpha,...patch}),RangeError);
});
