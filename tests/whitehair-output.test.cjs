const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let decode;
try{decode=require('../inference/white-hair/output.cjs').decodePreparedWhiteHairOutput;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
test('去白发输出：保留浮点作用范围，乘柔化蒙版后才转字节',async()=>{
 assert.equal(typeof decode,'function');await initializeOpenCV();const fixture=require('./fixtures/whitehair-output-opencv.json');assert.ok(fixture.prematureQuantizationDifferentBytes>0);
 for(const row of fixture.cases){const bytes=Buffer.from(row.tensor,'hex'),data=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),mask={data:new Uint8Array(row.width*row.height).fill(row.mask),width:row.width,height:row.height};
  const result=decode({data,dims:[1,4,row.height,row.width],mask});assert.equal(Buffer.from(result.image).toString('hex'),row.image,row.name+' RGB');assert.equal(Buffer.from(result.alpha).toString('hex'),row.alpha,row.name+' alpha');assert.deepEqual([result.width,result.height],[row.width,row.height]);assert.equal(Buffer.from(data.buffer).toString('hex'),row.tensor);assert.ok(mask.data.every(v=>v===row.mask));
 }
});
test('去白发输出：拒绝通道错误、作用范围尺寸不符及异常浮点数',()=>{
 assert.equal(typeof decode,'function');const input={data:new Float32Array(4),dims:[1,4,1,1],mask:{data:new Uint8Array(1),width:1,height:1}};
 for(const patch of [{dims:[1,3,1,1]},{mask:{...input.mask,width:2}},{data:new Float32Array([0,0,0,NaN])}])assert.throws(()=>decode({...input,...patch}),RangeError);
});
