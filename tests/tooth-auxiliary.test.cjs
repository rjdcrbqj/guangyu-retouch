const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let prepare;try{prepare=require('../inference/tooth-repair/auxiliary.cjs').prepareToothRepairAuxiliary;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('牙齿辅助图层：13点嘴部多边形、截断取整、边缘裁剪与float32填充',async()=>{
 assert.equal(typeof prepare,'function');await initializeOpenCV();for(const row of require('./fixtures/tooth-aux-opencv.json').cases){const landmarks=new Float32Array(row.landmarks),before=landmarks.slice(),out=prepare({landmarks});assert.deepEqual([out.width,out.height],[256,256]);assert.ok(out.data instanceof Float32Array);assert.equal(createHash('sha256').update(Buffer.from(out.data.buffer)).digest('hex'),row.expectedSHA256,row.name);assert.equal(out.data.filter(v=>v!==0).length,row.nonZero);assert.ok(out.data.every(v=>v===0||v===1));assert.deepEqual(landmarks,before);}
});
test('牙齿辅助图层：拒绝缺失关键点、异常坐标与错误数组类型',()=>{
 assert.equal(typeof prepare,'function');for(const landmarks of [new Float32Array(212),new Float32Array(215),new Float32Array(214).fill(NaN),new Float32Array(214).fill(1e30),new Float64Array(214)])assert.throws(()=>prepare({landmarks}),RangeError);
});
