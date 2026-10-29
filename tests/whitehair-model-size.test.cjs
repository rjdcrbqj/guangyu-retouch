const test=require('node:test'),assert=require('node:assert/strict');
let choose;
try{choose=require('../inference/white-hair/model-size.cjs').chooseWhiteHairModelSize;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
test('去白发网格：宽1024高1408上限、768参考下限及float32向下对齐64',()=>{
 assert.equal(typeof choose,'function');const fixture=require('./fixtures/whitehair-model-size-static.json');assert.ok(fixture.doublePrecisionCounterexamples>=12);
 for(const row of fixture.cases)assert.deepEqual(choose(row),row.modelWH,`${row.width}x${row.height}`);
});
test('去白发网格：拒绝无效或超过原有符号整数范围的尺寸',()=>{
 assert.equal(typeof choose,'function');for(const width of [0,-1,1.5,NaN,2147483648])assert.throws(()=>choose({width,height:100}),RangeError);
});
