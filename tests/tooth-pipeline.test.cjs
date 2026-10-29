const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let process;try{process=require('../inference/tooth-repair/pipeline.cjs').processPreparedToothRepair;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const hash=data=>createHash('sha256').update(Buffer.from(data.buffer,data.byteOffset,data.byteLength)).digest('hex');
const fixture=require('./fixtures/tooth-pipeline-opencv.json');
function setup(row){const image=new Uint8Array(row.height*row.stride);for(let i=0;i<image.length;i++)image[i]=(i*31+17)%256;return {...row,rect:[...row.rect],image,landmarks:new Float32Array(row.landmarks),mask:row.mask?{...row.mask,data:Buffer.from(row.mask.data,'hex')}:undefined};}
function tensors(){const n=512*512,image=new Float32Array(n*3),alpha=new Float32Array(n);for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=y*512+x;image[i]=20+x%200;image[n+i]=40+y%180;image[2*n+i]=60+(x+y)%150;if(x>=128&&x<384&&y>=192&&y<320)alpha[i]=((x*3+y)%32)/32;}assert.equal(hash(image),fixture.mockImageSHA256);assert.equal(hash(alpha),fixture.mockAlphaSHA256);return {image:Object.create({get data(){return image;},get dims(){return [1,3,512,512];}}),alpha:Object.create({get data(){return alpha;},get dims(){return [1,1,512,512];}})};}
test('牙齿串联：独立对照覆盖非方形区域、关键点宽度比例、先float后字节缩放和保护',async()=>{
 assert.equal(typeof process,'function');await initializeOpenCV();for(const row of fixture.cases){const input=setup(row),before=hash(input.image);let calls=0;input.infer=async value=>{calls++;assert.deepEqual(value.image.dims,[1,3,512,512]);assert.deepEqual(value.auxiliary.dims,[1,1,256,256]);assert.equal(hash(value.image.data),row.inputSHA256,row.name+' image');assert.equal(hash(value.auxiliary.data),row.auxiliarySHA256,row.name+' aux');return tensors();};const out=await process(input);assert.equal(calls,1);assert.equal(hash(out),row.outputSHA256,row.name);assert.equal(hash(input.image),before);}
});
test('牙齿串联：异步模型期间固定源图、区域、关键点与保护蒙版',async()=>{
 assert.equal(typeof process,'function');await initializeOpenCV();const row=fixture.cases[3],input=setup(row);let release;input.infer=()=>new Promise(resolve=>{release=resolve;});const pending=process(input);assert.equal(typeof release,'function');input.image.fill(0);input.rect[0]=0;input.landmarks.fill(0);input.mask.data.fill(0);release(tensors());assert.equal(hash(await pending),row.outputSHA256);
});
test('牙齿串联：区域任一边不足10像素时跳过模型',async()=>{
 assert.equal(typeof process,'function');for(const rect of [[0,0,9,10],[0,0,10,9],[0,0,0,0]]){const input=setup(fixture.cases[0]);input.rect=rect;input.infer=()=>{throw new Error('不应运行');};const out=await process(input);assert.deepEqual(out,input.image);assert.notEqual(out,input.image);}
});
test('牙齿串联：拒绝无效区域、辅助资料和模型输出',async()=>{
 assert.equal(typeof process,'function');await initializeOpenCV();for(const patch of [{rect:[0,0,999,10]},{landmarks:new Float32Array(212)},{stride:1},{mask:{data:new Uint8Array(1),width:2,height:1}},{branch:'unknown'}])await assert.rejects(process({...setup(fixture.cases[0]),...patch,infer:()=>{throw new Error('不应运行');}}),RangeError);
 await assert.rejects(process({...setup(fixture.cases[0]),infer:async()=>({image:{data:new Float32Array(3),dims:[1,3,1,1]},alpha:{data:new Float32Array(1),dims:[1,1,1,1]}})}),RangeError);
});
