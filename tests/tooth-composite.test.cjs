const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let compose;try{compose=require('../inference/tooth-repair/composite.cjs').composeCachedToothRepairRegion;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const floats=hex=>{const b=Buffer.from(hex,'hex');return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const setup=row=>({...row,image:Buffer.from(row.image,'hex'),cache:{...row.cache,image:Buffer.from(row.cache.image,'hex'),alpha:floats(row.cache.alpha)},mask:row.mask?{...row.mask,data:Buffer.from(row.mask.data,'hex')}:undefined});
test('牙齿缓存合成：补边、字节缩放、位与蒙版、整块向量尾部及RGBA保护',async()=>{
 assert.equal(typeof compose,'function');await initializeOpenCV();const fixture=require('./fixtures/tooth-composite-opencv.json');assert.ok(fixture.perRowDifferentBytes>0&&fixture.multiplyMaskDifferentBytes>0&&fixture.floatResizeFirstDifferentBytes>0);
 for(const row of fixture.cases){const input=setup(row),out=compose(input);assert.equal(Buffer.from(out).toString('hex'),row.expected,row.name);assert.equal(input.image.toString('hex'),row.image);assert.equal(input.cache.image.toString('hex'),row.cache.image);assert.equal(Buffer.from(input.cache.alpha.buffer).toString('hex'),row.cache.alpha);}
});
test('牙齿缓存合成：拒绝越界缓存、非有限浮点值及不支持的混合分支',()=>{
 assert.equal(typeof compose,'function');const row=require('./fixtures/tooth-composite-opencv.json').cases[0];
 for(const patch of [{rect:[0,0,999,2]},{cache:{...setup(row).cache,cropRect:[4,3,4,2]}},{cache:{...setup(row).cache,alpha:new Float32Array(8).fill(NaN)}},{mask:{data:new Uint8Array(1),width:2,height:1}},{branch:'unknown'},{channels:4,branch:'sse41'}])assert.throws(()=>compose({...setup(row),...patch}),RangeError);
});
