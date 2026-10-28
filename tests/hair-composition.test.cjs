const test=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('./fixtures/hair-composition-scalar.json');
const optimized=require('./fixtures/hair-composition-optimized.json');
let compose;
try{compose=require('../inference/hair-smooth/composite.cjs').composePreparedHairRegion;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('头发合成：24组RGB/RGBA原标量输出逐字节一致，输入不变',()=>{
 assert.equal(typeof compose,'function');
 for(const row of fixture.cases){
  const input={...row};for(const key of ['image','mask','alpha','smooth','detail'])input[key]=Buffer.from(row[key],'hex');
  const snapshots=Object.fromEntries(['image','mask','alpha','smooth','detail'].map(key=>[key,Buffer.from(input[key])]));
  const actual=compose(input);assert.equal(Buffer.from(actual).toString('hex'),row.originalHex,row.name);
  for(const key of Object.keys(snapshots))assert.deepEqual(input[key],snapshots[key],row.name+' '+key);
 }
});

test('头发合成：拒绝越界区域和不足的图层，避免越界读取',()=>{
 assert.equal(typeof compose,'function');
 const row=fixture.cases[0],input={...row};for(const key of ['image','mask','alpha','smooth','detail'])input[key]=Buffer.from(row[key],'hex');
 assert.throws(()=>compose({...input,x:-1}),/区域/);
 assert.throws(()=>compose({...input,channels:1}),/RGB/);
 assert.throws(()=>compose({...input,detail:new Uint8Array(0)}),/detail/);
});

test('头发合成：64组原SSE/AVX输出一致，包括半整数取偶差异',()=>{
 for(const row of optimized.cases){
  const input={...row,rounding:'nearest-even'};for(const key of ['image','mask','alpha','smooth','detail'])input[key]=Buffer.from(row[key],'hex');
  assert.equal(Buffer.from(compose(input)).toString('hex'),row.originalHex,row.kernel+' '+row.name);
 }
});
