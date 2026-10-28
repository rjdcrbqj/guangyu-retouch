const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let prepare;
try{prepare=require('../inference/hair-smooth/person-mask.cjs').preparePersonHairRegion;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('人物头发区域：先缩放人物蒙版，再按位组合并提取轮廓',async()=>{
 assert.equal(typeof prepare,'function');await initializeOpenCV();
 for(const row of require('./fixtures/hair-person-mask-opencv.json').cases){
  const hair={...row.hair,data:Buffer.from(row.hair.data,'hex')},person={...row.person,data:Buffer.from(row.person.data,'hex')};
  const out=prepare({hair,person});
  assert.equal(Buffer.from(out.mask).toString('hex'),row.combined,row.name+' 柔边蒙版');
  assert.equal(Buffer.from(out.selectedMask).toString('hex'),row.selectedMask,row.name+' 筛选后蒙版');
  assert.deepEqual([out.width,out.height],[hair.width,hair.height]);
  assert.equal(hair.data.toString('hex'),row.hair.data);assert.equal(person.data.toString('hex'),row.person.data);
 }
});

test('人物头发区域：保留原字节与运算，不能改成相乘或最小值',()=>{
 assert.equal(typeof prepare,'function');
 const hair={data:Uint8Array.from([128,255,51,200]),width:4,height:1};
 const person={data:Uint8Array.from([127,128,50,127]),width:4,height:1};
 const out=prepare({hair,person});
 assert.deepEqual(Array.from(out.mask),[0,128,50,72]);
});

test('人物头发区域：拒绝空蒙版、行距不足和不完整数据',()=>{
 assert.equal(typeof prepare,'function');
 const layer={data:new Uint8Array(12),width:4,height:3};
 assert.throws(()=>prepare({hair:layer,person:{...layer,width:0}}),RangeError);
 assert.throws(()=>prepare({hair:{...layer,stride:3},person:layer}),RangeError);
 assert.throws(()=>prepare({hair:layer,person:{...layer,data:new Uint8Array(0)}}),RangeError);
});
