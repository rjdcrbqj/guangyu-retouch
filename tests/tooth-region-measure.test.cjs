const test=require('node:test'),assert=require('node:assert/strict');
const {measurePreparedToothRegion:measure}=require('../inference/tooth-repair/geometry.cjs');
test('牙齿原始区域：只取外唇73至94点，保留float32中心与double位移',()=>{
 assert.equal(typeof measure,'function');const fixtures=require('./fixtures/tooth-region-measure-static.json');assert.ok(fixtures.floatOnlyDifferentCoordinates>0);for(const row of fixtures.cases){const landmarks=new Float32Array(row.landmarks),before=landmarks.slice(),result=measure({landmarks});for(const key of ['mouthBounds','unroundedOrigin','unroundedSide'])assert.deepEqual(result[key],row[key]);assert.deepEqual(landmarks,before);assert.equal(Object.hasOwn(result,'rect'),false);}
});
test('牙齿原始区域：不猜测整数取整，拒绝不足的外唇点和浮点溢出',()=>{
 assert.equal(typeof measure,'function');assert.throws(()=>measure({landmarks:new Float32Array(188)}),RangeError);const landmarks=new Float32Array(284);landmarks[73*2]=-3e38;landmarks[94*2]=3e38;assert.throws(()=>measure({landmarks}),RangeError);const zero=measure({landmarks:new Float32Array(284)});assert.deepEqual(zero,{mouthBounds:[0,0,0,0],unroundedOrigin:[0,0],unroundedSide:0});
});
