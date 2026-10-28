const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
const fixture=require('./fixtures/hair-image-prepare-opencv.json');
let prepare;
try{prepare=require('../inference/hair-smooth/prepare.cjs').prepareHairBaseImage;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('头发基础输入：40组裁切、去透明通道和两段缩放符合独立对照',async()=>{
 assert.equal(typeof prepare,'function');await initializeOpenCV();
 for(const row of fixture.cases){
  const image=Buffer.from(row.image,'hex'),out=prepare({...row,image});
  assert.equal(Buffer.from(out.pixels).toString('hex'),row.pixels,row.name);
  assert.deepEqual(out.intermediateWH,row.intermediateWH,row.name+' 原尺寸比较顺序');
  assert.deepEqual([out.width,out.height,out.channels],[...row.modelWH,3]);
  assert.equal(image.toString('hex'),row.image,row.name+' 原图不变');
 }
});

test('头发基础输入：拒绝过小区域、越界裁切和不完整图像',async()=>{
 assert.equal(typeof prepare,'function');await initializeOpenCV();
 const row=fixture.cases[0],input={...row,image:Buffer.from(row.image,'hex')};
 assert.throws(()=>prepare({...input,rect:[0,0,2,2]}),RangeError);
 assert.throws(()=>prepare({...input,rect:[input.width-1,0,3,3]}),RangeError);
 assert.throws(()=>prepare({...input,image:new Uint8Array(1)}),RangeError);
 assert.throws(()=>prepare({...input,modelWH:[0,3]}),RangeError);
});
