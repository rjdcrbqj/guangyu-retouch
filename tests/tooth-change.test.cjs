const test=require('node:test'),assert=require('node:assert/strict');
let analyze;try{analyze=require('../inference/tooth-repair/change-mask.cjs').analyzePreparedToothChanges;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('牙齿改动图：32组区域、通道和行距与独立OpenCV对照一致',()=>{
 assert.equal(typeof analyze,'function');for(const row of require('./fixtures/tooth-change-opencv.json').cases){const before=Buffer.from(row.before,'hex'),after=Buffer.from(row.after,'hex'),out=analyze({...row,before,after});for(const key of ['gray','mask','intensity'])assert.equal(Buffer.from(out[key]).toString('hex'),row[key],row.name+' '+key);assert.deepEqual([out.width,out.height],row.rect.slice(2));assert.equal(before.toString('hex'),row.before);assert.equal(after.toString('hex'),row.after);}
});
test('牙齿改动图：首通道上界1.5取偶为2，其余通道和透明度不沿用灰度阈值',()=>{
 assert.equal(typeof analyze,'function');const after=Uint8Array.from([0,0,0,0,1,0,0,0,2,0,0,0,3,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,2,2,2,0]);const out=analyze({before:new Uint8Array(after.length),after,width:8,height:1,channels:4});assert.deepEqual(Array.from(out.mask),[0,0,0,255,255,255,255,255]);assert.deepEqual(Array.from(out.gray),[0,0,0,0,1,0,0,2]);assert.deepEqual(Array.from(out.intensity),[0,0,0,0,0,0,0,2]);
});
test('牙齿改动图：拒绝越界区域和短行',()=>{
 assert.equal(typeof analyze,'function');const input={before:new Uint8Array(27),after:new Uint8Array(27),width:3,height:3};for(const patch of [{after:new Uint8Array(26)},{beforeStride:8},{rect:[2,0,2,2]},{channels:2}])assert.throws(()=>analyze({...input,...patch}),RangeError);
});
