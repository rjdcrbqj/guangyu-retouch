const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/hair-change-mask-opencv.json');
let changes;try{changes=require('../inference/hair-smooth/change-mask.cjs').analyzePreparedHairChanges;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}

test('头发改动蒙版：64组不同颜色、透明度、行距及区域符合独立OpenCV对照',()=>{
 assert.equal(typeof changes,'function');
 for(const row of fixture.cases){
  const before=Buffer.from(row.before,'hex'),after=Buffer.from(row.after,'hex');
  const output=changes({...row,before,after});
  for(const name of ['gray','mask','intensity'])assert.equal(Buffer.from(output[name]).toString('hex'),row[name],row.name+' '+name);
  assert.equal(output.width,row.rect[2]);assert.equal(output.height,row.rect[3]);
  assert.equal(before.toString('hex'),row.before);assert.equal(after.toString('hex'),row.after);
 }
});

test('头发改动蒙版：灰度2保留强度但不计入阈值2蒙版，透明度变化不计入',()=>{
 assert.equal(typeof changes,'function');
 const before=new Uint8Array(36),after=Uint8Array.from([0,0,0,0,1,1,1,0,2,2,2,0,3,3,3,0,0,0,0,255,17,0,0,0,0,0,5,0,0,4,0,0,0,5,0,0]);
 const output=changes({before,after,width:9,height:1,channels:4});
 assert.deepEqual(Array.from(output.gray),[0,1,2,3,0,2,1,2,3]);
 assert.deepEqual(Array.from(output.mask),[0,0,0,255,0,0,0,0,255]);
 assert.deepEqual(Array.from(output.intensity),[0,0,2,3,0,2,0,2,3]);
});

test('头发改动蒙版：拒绝无效图像和越界区域',()=>{
 assert.equal(typeof changes,'function');const row={before:new Uint8Array(27),after:new Uint8Array(27),width:3,height:3,channels:3};
 for(const patch of [{after:new Uint8Array(26)},{beforeStride:8},{rect:[2,0,2,2]},{rect:[0,0,0,1]},{channels:1}])assert.throws(()=>changes({...row,...patch}),RangeError);
});
