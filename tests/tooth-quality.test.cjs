const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let score;try{score=require('../inference/tooth-repair/quality.cjs').scorePreparedToothRepairDetail;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('牙齿清晰度：灰度、256网格、四角频率清除与对数均值符合独立浮点对照',async()=>{
 assert.equal(typeof score,'function');await initializeOpenCV();const fixture=require('./fixtures/tooth-quality-opencv.json'),values={};for(const row of fixture.cases){const data=Buffer.from(row.data,'hex'),value=score({...row,data});values[row.name]=value;assert.ok(Math.abs(value-row.score)<=fixture.tolerance,row.name+' '+value+' vs '+row.score);assert.equal(data.toString('hex'),row.data);assert.equal(value,Math.fround(value));}
 assert.equal(values.black,-1);assert.equal(values.constant,-1);assert.equal(values['sharp-rgb'],values['sharp-rgba']);assert.ok(values['sharp-rgb']>values['blurred-rgb']);
});
test('牙齿清晰度：拒绝无效图层和行距',()=>{
 assert.equal(typeof score,'function');const input={data:new Uint8Array(12),width:2,height:2,channels:3};for(const patch of [{channels:2},{stride:5},{data:new Uint8Array(11)},{width:0}])assert.throws(()=>score({...input,...patch}),RangeError);
});
