const test=require('node:test'),assert=require('node:assert/strict'),{inflateSync}=require('node:zlib');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
const {describePreparedToothChanges:describe}=require('../inference/tooth-repair/change-mask.cjs');
const fixtures=require('./fixtures/tooth-change-geometry-opencv.json');
const canonical=contours=>contours.map(c=>JSON.stringify(Array.from(c))).sort();
test('牙齿改动轮廓：18组独立对照覆盖凸包、形态学、边界、简化与float32坐标',async()=>{
 assert.equal(typeof describe,'function');await initializeOpenCV();for(const row of fixtures.cases){const data=inflateSync(Buffer.from(row.data,'base64')),before=data.slice(),out=describe({...row,data});assert.ok(out.hull instanceof Float32Array);assert.ok(out.contours.every(c=>c instanceof Float32Array));assert.deepEqual(Array.from(out.hull),row.hull,row.name+' hull');assert.deepEqual(canonical(out.contours),canonical(row.contours),row.name+' contours');assert.deepEqual(data,before,row.name+' input');}
});
test('牙齿改动轮廓：小区域保留原始凸包，简化轮廓按面积从大到小',async()=>{
 assert.equal(typeof describe,'function');await initializeOpenCV();const small=fixtures.cases.find(c=>c.name==='width-eight-skips-simplification'),a=describe({...small,data:inflateSync(Buffer.from(small.data,'base64'))});assert.ok(a.hull.length);assert.equal(a.contours.length,0);
 const row=fixtures.cases.find(c=>c.name==='disconnected-area-order'),out=describe({...row,data:inflateSync(Buffer.from(row.data,'base64'))});assert.deepEqual(out.contours.map(c=>Array.from(c)),row.contours);assert.equal(out.contours.length,3);
});
test('牙齿改动轮廓：拒绝短行、越界坐标和无效尺寸',()=>{
 assert.equal(typeof describe,'function');const input={data:new Uint8Array(100),width:10,height:10};for(const patch of [{data:new Uint8Array(99)},{stride:9},{origin:[.5,0]},{origin:[2147483640,0]},{height:0}])assert.throws(()=>describe({...input,...patch}),RangeError);
});
