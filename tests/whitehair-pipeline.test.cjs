const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let process;
try{process=require('../inference/white-hair/pipeline.cjs').processPreparedWhiteHair;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const floats=hex=>{const b=Buffer.from(hex,'hex');return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const setup=row=>({...row,image:Buffer.from(row.image,'hex'),mask:{...row.mask,data:Buffer.from(row.mask.data,'hex')},geometry:structuredClone(row.geometry)});
test('去白发串联：独立对照覆盖直接缩放、强度量化、逐行向量尾部与RGBA保护',async()=>{
 assert.equal(typeof process,'function');await initializeOpenCV();
 for(const row of require('./fixtures/whitehair-pipeline-opencv.json').cases){const input=setup(row);let calls=0;
  input.infer=async tensor=>{calls++;assert.deepEqual(tensor.dims,[1,4,6,8]);assert.equal(Buffer.from(tensor.data.buffer).toString('hex'),row.input,row.name+' input');return Object.create({get data(){return floats(row.tensor);},get dims(){return [1,4,6,8];}});};
  const out=await process(input);assert.equal(calls,row.modelCalls);assert.equal(Buffer.from(out).toString('hex'),row.expected,row.name);assert.equal(input.image.toString('hex'),row.image);assert.equal(input.mask.data.toString('hex'),row.mask.data);
 }
});
test('去白发串联：等待模型时保留本次源图与区域快照',async()=>{
 assert.equal(typeof process,'function');await initializeOpenCV();const row=require('./fixtures/whitehair-pipeline-opencv.json').cases[0],input=setup(row);let release;
 input.infer=()=>new Promise(resolve=>{release=resolve;});const pending=process(input);assert.equal(typeof release,'function');input.image.fill(0);input.geometry.sourceRect[0]=0;input.mask.data.fill(0);release({data:floats(row.tensor),dims:[1,4,6,8]});assert.equal(Buffer.from(await pending).toString('hex'),row.expected);
});
test('去白发串联：拒绝错位模型结果及非法区域',async()=>{
 assert.equal(typeof process,'function');await initializeOpenCV();const row=require('./fixtures/whitehair-pipeline-opencv.json').cases[0];
 await assert.rejects(process({...setup(row),infer:async()=>({data:floats(row.tensor),dims:[1,4,8,6]})}),RangeError);
 for(const patch of [{strength:NaN},{geometry:{...row.geometry,sourceRect:[0,0,999,5]}},{geometry:{...row.geometry,modelWH:[Number.MAX_SAFE_INTEGER,2]}},{stride:1},{branch:'unknown'}])await assert.rejects(process({...setup(row),...patch,infer:()=>{throw new Error('不应进入模型');}}),RangeError);
});
test('去白发串联：任一边不足3像素时保留原图并跳过模型',async()=>{
 assert.equal(typeof process,'function');const row=require('./fixtures/whitehair-pipeline-opencv.json').cases[0];
 for(const rect of [[0,0,2,5],[0,0,5,2],[0,0,0,0]]){const input=setup(row);input.geometry.sourceRect=rect;input.infer=()=>{throw new Error('小区域不应运行模型');};assert.equal(Buffer.from(await process(input)).toString('hex'),row.image);}
});
