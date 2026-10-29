const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
const {resizePreparedToothRepairOutput:resize}=require('../inference/tooth-repair/output.cjs');
const floats=hex=>{const b=Buffer.from(hex,'hex');return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
test('牙齿小区域输出：任一边小于模型边长才逐平面float缩放，较大区域保留模型网格',async()=>{
 assert.equal(typeof resize,'function');await initializeOpenCV();const f=require('./fixtures/tooth-grid-opencv.json');for(const row of f.cases){const image={data:floats(f.image),dims:[1,3,4,4]},alpha={data:floats(f.alpha),dims:[1,1,4,4]},out=resize({image,alpha,modelSide:4,targetWH:row.targetWH});assert.deepEqual(out.image.dims,[1,3,row.height,row.width]);assert.deepEqual(out.alpha.dims,[1,1,row.height,row.width]);
  for(const key of ['image','alpha']){const expected=floats(row[key]);assert.equal(out[key].data.length,expected.length);for(let i=0;i<expected.length;i++)assert.ok(Math.abs(out[key].data[i]-expected[i])<=2e-5,key+' '+i);}
  image.data.fill(0);alpha.data.fill(0);assert.ok(out.image.data.some(v=>v!==0));assert.ok(out.alpha.data.some(v=>v!==0));
 }
});
test('牙齿小区域输出：拒绝无效目标尺寸和模型边长不符的张量',()=>{
 assert.equal(typeof resize,'function');const input={image:{data:new Float32Array(48),dims:[1,3,4,4]},alpha:{data:new Float32Array(16),dims:[1,1,4,4]},modelSide:4,targetWH:[2,3]};
 for(const patch of [{targetWH:[0,2]},{targetWH:[2.5,3]},{modelSide:5},{alpha:{...input.alpha,dims:[1,1,2,8]}}])assert.throws(()=>resize({...input,...patch}),RangeError);
});
