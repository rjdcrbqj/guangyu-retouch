'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const moduleFile=path.join(__dirname,'../inference/skin-reference/models.cjs');
const modelFile=path.join(__dirname,'../inference/assets/skin-reference/reference-resize-wrapper.onnx');
const AREA=768*768;
let validBytes;
const bytes=()=>validBytes??=fs.readFile(modelFile);
const inputs=()=>({photo:new Float32Array(3*AREA),currentMask:new Float32Array(AREA),reference:new Float32Array(3*64*64),referenceMask:new Float32Array(64*64)});
const outputs=()=>({'191':{type:'float32',dims:[1,9,768,768],data:new Float32Array(9*AREA)},'125':{type:'float32',dims:[1,1,768,768],data:new Float32Array(AREA)}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function create(overrides={}){
 const {SkinReferenceModels}=require(moduleFile);
 return new SkinReferenceModels({file:modelFile,readFile:()=>bytes(),sessionFactory:async()=>({run:async()=>outputs(),release:async()=>{}}),tensorFactory:(type,data,dims)=>({type,data,dims}),...overrides});
}

test('the dedicated four-input backend exists without loading ORT',async()=>{
 assert.equal(await fs.access(moduleFile).then(()=>true,()=>false),true,'reference model wrapper is missing');
 create();assert.equal(Object.keys(require.cache).some(p=>/[\\/]onnxruntime-node[\\/]/.test(p)),false);
});

test('default model path loads the staged verified asset without a custom file reader',async()=>{
 const {SkinReferenceModels}=require(moduleFile);
 const backend=new SkinReferenceModels({sessionFactory:async()=>({run:async()=>outputs(),release:async()=>{}}),tensorFactory:(type,data,dims)=>({type,data,dims})});
 const result=await backend.run(inputs());assert.equal(result.coefficients.length,9*AREA);await backend.close();
});

test('named rank4 feeds keep the mixed64/768 ABI and return two outputs',async()=>{
 let observed,options;const wanted=outputs();wanted['191'].data[7]=.125;wanted['125'].data[9]=-.25;
 const backend=create({sessionFactory:async(b,o)=>{assert.deepEqual(b,await bytes());options=o;return {run:async feeds=>{observed=feeds;return wanted;},release:async()=>{}};}});
 const result=await backend.run(inputs());
 assert.deepEqual(Object.keys(observed).sort(),['100','116','210','247']);
 for(const [name,dims] of [['210',[1,3,768,768]],['116',[1,1,768,768]],['100',[1,3,64,64]],['247',[1,1,64,64]]]){
  assert.deepEqual(observed[name].dims,dims);assert.equal(observed[name].type,'float32');assert.ok(observed[name].data instanceof Float32Array);
 }
 assert.deepEqual(options,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1,executionMode:'sequential',graphOptimizationLevel:'disabled'});
 assert.equal(result.coefficients,wanted['191'].data);assert.equal(result.mask,wanted['125'].data);
 assert.equal(result.coefficients[7],.125);assert.equal(result.mask[9],-.25);
 assert.deepEqual(Object.keys(result).sort(),['coefficients','mask']);await backend.close();
});

test('invalid inputs are rejected before loading a model',async t=>{
 for(const [label,mutate] of [['missing',v=>delete v.referenceMask],['wrongType',v=>v.currentMask=new Uint8Array(AREA)],['wrongPhotoLength',v=>v.photo=new Float32Array(3*AREA-1)],['reference768',v=>v.reference=new Float32Array(3*AREA)],['NaN',v=>v.reference[0]=NaN],['Infinity',v=>v.photo[0]=Infinity]])await t.test(label,async()=>{
  let reads=0;const backend=create({readFile:async()=>{reads++;return bytes();}}),v=inputs();mutate(v);
  await assert.rejects(backend.run(v),/input/i);assert.equal(reads,0);await backend.close();
 });
});

test('malformed outputs cannot pass as reference768 tensors',async t=>{
 for(const [label,mutate] of [['missing',v=>delete v['125']],['rank',v=>v['191'].dims=[9,768,768]],['384grid',v=>v['191'].dims=[1,9,384,384]],['head3',v=>v['191'].dims=[1,3,768,768]],['shortLength',v=>v['125'].data=new Float32Array(AREA-1)],['wrongStorage',v=>v['125'].data=new Float64Array(AREA)],['wrongType',v=>v['125'].type='int32'],['NaN',v=>v['125'].data[AREA-1]=NaN],['Infinity',v=>v['191'].data[9*AREA-1]=Infinity]])await t.test(label,async()=>{
  const v=outputs();mutate(v);const backend=create({sessionFactory:async()=>({run:async()=>v,release:async()=>{}})});
  await assert.rejects(backend.run(inputs()),/output/i);await backend.close();
 });
});

test('all input buffers are snapshotted before asynchronous file loading',async()=>{
 const gate=deferred(),seen=deferred(),v=inputs();let received;
 for(const a of Object.values(v)){a[0]=.125;a[a.length-1]=-.25;}
 const backend=create({readFile:async()=>{seen.resolve();await gate.promise;return bytes();},sessionFactory:async()=>({run:async feeds=>{received=feeds;return outputs();},release:async()=>{}})});
 const pending=backend.run(v);await seen.promise;for(const a of Object.values(v))a.fill(.75);gate.resolve();await pending;
 for(const a of Object.values(received)){assert.equal(a.data[0],.125);assert.equal(a.data[a.data.length-1],-.25);assert.ok(!Object.values(v).includes(a.data));}await backend.close();
});

test('a busy backend rejects overlapping jobs and accepts the next job',async()=>{
 const gate=deferred(),entered=deferred();let runs=0;
 const backend=create({sessionFactory:async()=>({run:async()=>{runs++;if(runs===1){entered.resolve();await gate.promise;}return outputs();},release:async()=>{}})});
 const first=backend.run(inputs());await entered.promise;await assert.rejects(backend.run(inputs()),/busy/i);assert.equal(runs,1);
 gate.resolve();await first;await backend.run(inputs());assert.equal(runs,2);await backend.close();
});

test('bad SHA refuses session creation and permits a corrected file retry',async()=>{
 let reads=0,creates=0;const backend=create({readFile:async()=>++reads===1?Buffer.from('not the candidate'):bytes(),sessionFactory:async()=>{creates++;return {run:async()=>outputs(),release:async()=>{}};}});
 await assert.rejects(backend.run(inputs()),/SHA256/i);assert.equal(creates,0);
 await backend.run(inputs());assert.equal(reads,2);assert.equal(creates,1);await backend.close();
});

test('failed file reads are retried on the next job',async()=>{
 let reads=0;const backend=create({readFile:async()=>{if(++reads===1)throw Error('read unavailable');return bytes();}});
 await assert.rejects(backend.run(inputs()),/read unavailable/);await backend.run(inputs());assert.equal(reads,2);await backend.close();
});

test('failed session creation is retried on the next job',async()=>{
 let creates=0;const backend=create({sessionFactory:async()=>{if(++creates===1)throw Error('create unavailable');return {run:async()=>outputs(),release:async()=>{}};}});
 await assert.rejects(backend.run(inputs()),/create unavailable/);await backend.run(inputs());assert.equal(creates,2);await backend.close();
});

test('a failed run releases busy state and reuses the successful session',async()=>{
 let creates=0,runs=0;const backend=create({sessionFactory:async()=>{creates++;return {run:async()=>{if(++runs===1)throw Error('run unavailable');return outputs();},release:async()=>{}};}});
 await assert.rejects(backend.run(inputs()),/run unavailable/);await backend.run(inputs());assert.equal(creates,1);assert.equal(runs,2);await backend.close();
});

test('close waits during loading and running, rejects new work and releases once',async()=>{
 const load=deferred(),loading=deferred(),run=deferred(),running=deferred(),release=deferred(),releasing=deferred();let releases=0;
 const backend=create({readFile:async()=>{loading.resolve();await load.promise;return bytes();},sessionFactory:async()=>({run:async()=>{running.resolve();await run.promise;return outputs();},release:async()=>{releases++;releasing.resolve();await release.promise;}})});
 const job=backend.run(inputs());await loading.promise;let closed=false;const close1=backend.close().then(()=>closed=true),close2=backend.close();
 await assert.rejects(backend.run(inputs()),/closed/i);assert.equal(closed,false);assert.equal(releases,0);
 load.resolve();await running.promise;assert.equal(closed,false);assert.equal(releases,0);
 run.resolve();await job;await releasing.promise;assert.equal(closed,false);assert.equal(releases,1);release.resolve();await Promise.all([close1,close2,backend.close()]);assert.equal(closed,true);assert.equal(releases,1);
});

test('close after failed loading completes without a session release',async()=>{
 const loading=deferred(),load=deferred();let creates=0;
 const backend=create({readFile:async()=>{loading.resolve();await load.promise;throw Error('load failed');},sessionFactory:async()=>{creates++;}});
 const job=backend.run(inputs()),jobRejected=assert.rejects(job,/load failed/);await loading.promise;const closing=backend.close();load.resolve();await jobRejected;await closing;assert.equal(creates,0);await assert.rejects(backend.run(inputs()),/closed/i);
});

test('release failure is observable and does not retry the same release',async()=>{
 let releases=0;const backend=create({sessionFactory:async()=>({run:async()=>outputs(),release:async()=>{releases++;throw Error('release failed');}})});
 await backend.run(inputs());await assert.rejects(backend.close(),/release failed/);await assert.rejects(backend.close(),/release failed/);assert.equal(releases,1);
});

test('closing an unused backend does not load the model or dependency',async()=>{
 let reads=0;const backend=create({readFile:async()=>{reads++;return bytes();}});await backend.close();await backend.close();assert.equal(reads,0);await assert.rejects(backend.run(inputs()),/closed/i);
});
