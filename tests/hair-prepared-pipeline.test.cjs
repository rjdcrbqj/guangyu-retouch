const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
const {createPreparedHairProcessor}=require('../inference/hair-smooth/pipeline.cjs');
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

test('头发已准备流程：两项强度都低于原float32阈值时跳过模型，边界值仍处理',async()=>{
 assert.equal(typeof processHair,'function');await initializeOpenCV();
 for(const [smoothStrength,detailStrength,shouldRun] of [[0,0,false],[.0009,.0009999,false],[.001,0,true],[0,.001,true],[.000999999999,.000999999999,true]]){
  const input=syntheticInput(),calls=[];
  const output=await processHair({...input,smoothStrength,detailStrength,infer:providers(calls)});
  assert.deepEqual(calls,shouldRun?['base','detail']:[],String([smoothStrength,detailStrength]));
  if(!shouldRun){assert.deepEqual(output,input.image);assert.notEqual(output,input.image);}
 }
});

test('头发缓存：接近的强度复用张量但按当前强度合成，比较基准保持为上次模型计算值',async()=>{
 assert.equal(typeof createPreparedHairProcessor,'function');await initializeOpenCV();
 const processor=createPreparedHairProcessor(),calls=[],input={...syntheticInput(),infer:providers(calls),smoothStrength:.5,detailStrength:.3125};
 const first=await processor.process(input);assert.equal(first[30],70);
 first.fill(0);
 const second=await processor.process({...input,smoothStrength:.49995});assert.equal(second[30],69);
 assert.deepEqual(calls,['base','detail']);assert.equal(second[0],10);
 await processor.process({...input,smoothStrength:.49989});assert.equal(calls.length,4);
});

test('头发缓存：严格区分小于和等于原float32容差',async()=>{
 assert.equal(typeof createPreparedHairProcessor,'function');await initializeOpenCV();
 const processor=createPreparedHairProcessor(),calls=[],input={...syntheticInput(),infer:providers(calls),smoothStrength:0};
 await processor.process(input);await processor.process({...input,smoothStrength:.00009});assert.equal(calls.length,2);
 await processor.process({...input,smoothStrength:.000099999999});assert.equal(calls.length,4);
});

test('头发缓存：源图、蒙版、区域、供应器或重算标记变化后不能使用旧模型结果',async()=>{
 assert.equal(typeof createPreparedHairProcessor,'function');await initializeOpenCV();
 const processor=createPreparedHairProcessor(),calls=[],input={...syntheticInput(),infer:providers(calls)};
 await processor.process(input);await processor.process(input);assert.equal(calls.length,2);
 input.image[0]=11;const changed=await processor.process(input);assert.equal(changed[0],11);assert.equal(calls.length,4);
 input.mask.data[0]=254;await processor.process(input);assert.equal(calls.length,6);
 input.geometry.sourceRect[0]=2;await processor.process(input);assert.equal(calls.length,8);
 const base=input.infer.base;input.infer={...input.infer,base:value=>base(value)};
 await processor.process(input);assert.equal(calls.length,10);
 await processor.process({...input,dirty:true});assert.equal(calls.length,12);
 await processor.process(input);assert.equal(calls.length,12);
 processor.invalidate();await processor.process(input);assert.equal(calls.length,14);
});

test('头发缓存：暂时降至跳过阈值保留源图，恢复原强度仍可使用有效模型结果',async()=>{
 assert.equal(typeof createPreparedHairProcessor,'function');await initializeOpenCV();
 const processor=createPreparedHairProcessor(),calls=[],input={...syntheticInput(),infer:providers(calls)};
 const first=await processor.process(input);
 const disabled=await processor.process({...input,smoothStrength:0,detailStrength:0});
 assert.deepEqual(disabled,input.image);assert.notEqual(disabled,input.image);
 assert.deepEqual(await processor.process(input),first);assert.equal(calls.length,2);
});

test('头发缓存：重算失败会使旧结果失效，下一次请求重新执行模型',async()=>{
 assert.equal(typeof createPreparedHairProcessor,'function');await initializeOpenCV();
 const processor=createPreparedHairProcessor(),calls=[],supplied=providers(calls);let fail=false,attempts=0;
 const input={...syntheticInput(),infer:{...supplied,base:async value=>{attempts++;if(fail)throw new Error('synthetic failure');return supplied.base(value);}}};
 const first=await processor.process(input);fail=true;
 await assert.rejects(processor.process({...input,dirty:true}),/synthetic failure/);
 fail=false;assert.deepEqual(await processor.process(input),first);assert.equal(attempts,3);
});

test('头发缓存：较早请求晚完成时不得覆盖较新请求的缓存',async()=>{
 assert.equal(typeof createPreparedHairProcessor,'function');await initializeOpenCV();
 const processor=createPreparedHairProcessor(),calls=[],supplied=providers(calls),pending=[];
 const input={...syntheticInput(),infer:{...supplied,base:value=>new Promise((resolve,reject)=>pending.push(()=>supplied.base(value).then(resolve,reject)))}};
 const older=processor.process({...input,smoothStrength:.5});input.image[0]=11;
 const newer=processor.process({...input,smoothStrength:.8});
 assert.equal(pending.length,2);pending[1]();const expected=await newer;pending[0]();const oldOutput=await older;
 assert.equal(oldOutput[0],10);assert.equal(expected[0],11);
 const latest=processor.process({...input,smoothStrength:.8});
 assert.equal(pending.length,2,'较早结果不得导致最新参数重新运行模型');
 assert.deepEqual(await latest,expected);assert.equal(calls.length,4);
});
