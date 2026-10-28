const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
const fixture=require('./fixtures/hair-detail-prepare-opencv.json');
const preparation=require('../inference/hair-smooth/prepare.cjs');

test('头发细节输入：原混合结果经缩放、蒙版打包后逐字节一致',async()=>{
 assert.equal(typeof preparation.prepareHairDetailInput,'function');await initializeOpenCV();
 for(const row of fixture.cases){
  const input={...row};for(const key of ['image','smooth','alpha','mask'])input[key]=Buffer.from(row[key],'hex');
  const out=preparation.prepareHairDetailInput(input);
  assert.deepEqual(out.dims,[1,4,row.detailSide,row.detailSide],row.name);
  assert.equal(Buffer.from(out.data.buffer,out.data.byteOffset,out.data.byteLength).toString('hex'),row.tensor,row.name);
  for(const key of ['image','smooth','alpha','mask'])assert.equal(input[key].toString('hex'),row[key],row.name+' '+key);
 }
});

test('头发细节输入：拒绝缺失蒙版、退化输入和未知分支',()=>{
 assert.equal(typeof preparation.prepareHairDetailInput,'function');
 const row=fixture.cases[0],input={...row};for(const key of ['image','smooth','alpha','mask'])input[key]=Buffer.from(row[key],'hex');
 assert.throws(()=>preparation.prepareHairDetailInput({...input,mask:new Uint8Array(0)}),RangeError);
 assert.throws(()=>preparation.prepareHairDetailInput({...input,detailSide:0}),RangeError);
 assert.throws(()=>preparation.prepareHairDetailInput({...input,width:0}),RangeError);
 assert.throws(()=>preparation.prepareHairDetailInput({...input,branch:'unknown'}),RangeError);
});
