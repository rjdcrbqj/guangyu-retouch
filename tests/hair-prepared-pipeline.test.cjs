const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let processHair;
try{processHair=require('../inference/hair-smooth/pipeline.cjs').processPreparedHair;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

function syntheticInput(){
 const width=6,height=5,channels=4,stride=26,image=new Uint8Array(stride*height).fill(199);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)image.set([10,20,30,77],y*stride+x*4);
 return {image,width,height,channels,stride,mask:{data:new Uint8Array(16).fill(255),width:4,height:4},
  geometry:{sourceRect:[1,1,3,3],maskRect:[1,1,2,2],baseWH:[3,3],detailSide:2}};
}

// 固定合成张量供应器用于检查流程接线；不是原模型一致性验证。
function providers(calls){return {
 base:async input=>{calls.push('base');assert.deepEqual(input.dims,[1,4,3,3]);assert.ok(input.data.slice(27).every(v=>v===255));const data=new Float32Array(36);data.fill(1,27);return {data,dims:[1,4,3,3]};},
 detail:async input=>{calls.push('detail');assert.deepEqual(input.dims,[1,4,2,2]);assert.ok(input.data.slice(12).every(v=>v===255));return {data:new Float32Array(8),dims:[1,2,2,2]};}
};}

test('头发已准备流程：基础输出进入细节模型，最终仅修改指定区域RGB',async()=>{
 assert.equal(typeof processHair,'function');await initializeOpenCV();
 const input=syntheticInput(),before=Uint8Array.from(input.image),calls=[];
 const output=await processHair({...input,infer:providers(calls)});
 const expected=Uint8Array.from(before);
 for(let y=1;y<4;y++)for(let x=1;x<4;x++)expected.set([130,130,130],y*26+x*4);
 assert.deepEqual(output,expected);assert.deepEqual(calls,['base','detail']);
 assert.deepEqual(input.image,before);assert.ok(input.mask.data.every(v=>v===255));
});

test('头发已准备流程：零柔边蒙版始终保留完整源图',async()=>{
 assert.equal(typeof processHair,'function');await initializeOpenCV();
 const input=syntheticInput();input.mask.data.fill(0);
 const output=await processHair({...input,infer:{
  base:async()=>({data:new Float32Array(36).fill(1),dims:[1,4,3,3]}),
  detail:async()=>({data:new Float32Array(8).fill(1),dims:[1,2,2,2]})
 }});
 assert.deepEqual(output,input.image);assert.notEqual(output,input.image);
});

test('头发已准备流程：拒绝错误模型尺寸，失败时保留源图',async()=>{
 assert.equal(typeof processHair,'function');await initializeOpenCV();
 const input=syntheticInput(),before=Uint8Array.from(input.image);
 await assert.rejects(processHair({...input,infer:{base:async()=>({data:new Float32Array(16),dims:[1,4,2,2]}),detail:async()=>assert.fail('错误基础输出不能继续处理')}}),/尺寸/);
 await assert.rejects(processHair({...input,geometry:{...input.geometry,maskRect:[3,3,2,2]},infer:providers([])}),RangeError);
 assert.deepEqual(input.image,before);
});

test('头发已准备流程：接受实际推理库通过属性访问器返回的张量',async()=>{
 assert.equal(typeof processHair,'function');await initializeOpenCV();
 const supplied=providers([]),input=syntheticInput();
 const wrap=async fn=>{
  const value=await fn;
  return Object.create({get data(){return value.data;},get dims(){return value.dims;}});
 };
 const output=await processHair({...input,infer:{base:v=>wrap(supplied.base(v)),detail:v=>wrap(supplied.detail(v))}});
 assert.deepEqual(Array.from(output.subarray(30,34)),[130,130,130,77]);
});
