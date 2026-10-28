import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
const {createSkinReferenceHandler}=require('../inference/skin-reference/ipc.cjs');

// Electron 的 ipcMain.handle 会把参数经结构化克隆传递。本用例模拟该序列化边界，
// 验证 TypedArray（Uint8Array/Int32Array/Float32Array）在克隆后仍然可用，
// 且真实 processor 的预检与快照逻辑不会被克隆破坏。
// 不加载ONNX、不跑NN、不打开原版。

const W=96,H=64;
function build(){
 const rgba=new Uint8Array(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;rgba[i]=(x*3)%256;rgba[i+1]=(y*5)%256;rgba[i+2]=((x+y)*2)%256;rgba[i+3]=255;}
 return {
  original:{data:rgba,width:W,height:H,stride:W*4,channels:4},
  workingPhoto:{data:new Uint8Array(W*H*3).fill(60),width:W,height:H,stride:W*3,format:301},
  temporaryMask:{data:new Uint8Array(W*H).fill(255),width:W,height:H,stride:W},
  geometry:{valid:true,originalROI:Int32Array.from([0,0,W,H]),
   inputForward:Float32Array.from([Math.fround(768/W),0,0,0,Math.fround(768/H),0]),
   postAffine:Float32Array.from([1,0,0,0,1,0])},
  referencePNG:{data:new Uint8Array(1000),policy:'p'},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:new Uint8Array(W*H).fill(255),blendMaskStride:W,
  secondaryTestMask:new Uint8Array(W*H),secondaryTestMaskStride:W,
  intensity:.5,referenceRevision:2};
}

test('typed arrays survive an Electron-style structured-clone boundary',async()=>{
 const sent=build();
 // 模拟 IPC：结构化克隆（Electron 实际使用的机制）
 const received=structuredClone(sent);
 assert.equal(received.original.data instanceof Uint8Array,true);
 assert.equal(received.geometry.originalROI instanceof Int32Array,true);
 assert.equal(received.geometry.inputForward instanceof Float32Array,true);
 assert.equal(received.geometry.postAffine instanceof Float32Array,true);
 assert.equal(received.blendMask instanceof Uint8Array,true);
 assert.equal(received.referenceMask.data.length,4096);
 // 克隆必须保持数值与长度
 assert.deepEqual(Array.from(received.geometry.originalROI),[0,0,W,H]);
 assert.equal(received.geometry.inputForward[0],Math.fround(768/W));
 assert.equal(received.intensity,.5);
});

test('the handler accepts a cloned request and reaches the backend with correct shapes',async()=>{
 let got=null;
 const processor=new SkinReferenceProcessor({models:{run(i){got=i;return Promise.resolve({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(-1)});},async close(){}}});
 const handler=createSkinReferenceHandler({processor});
 // 参考PNG是占位字节，真实解码会失败——用有效PNG替换
 const zlib=require('node:zlib');
 const {encodeReferencePNG64}=await import('../src/reference-png.js');
 const patch=new Uint8Array(64*64*4);
 for(let i=0;i<64*64;i++){patch[i*4]=200;patch[i*4+1]=100;patch[i*4+2]=50;patch[i*4+3]=255;}
 const png=await encodeReferencePNG64(patch);
 const req=build();req.referencePNG={data:png,policy:'encoded-opaque-rgba8-reference64-no-metadata-transform'};
 const cloned=structuredClone(req);
 const out=await handler({},cloned);
 assert.equal(out.referenceRevision,2);
 assert.ok(got,'后端必须收到四输入');
 assert.equal(got.photo.length,3*768*768);
 assert.equal(got.currentMask.length,768*768);
 assert.equal(got.reference.length,3*64*64);
 assert.equal(got.referenceMask.length,64*64);
 await processor.close();
});

test('the handler rejects a cloned request that lost its reference mask',async()=>{
 let calls=0;
 const handler=createSkinReferenceHandler({processor:{run(){calls++;},close(){}}});
 const req=build();delete req.referenceMask;
 await assert.rejects(handler({},structuredClone(req)),/referenceMask/);
 assert.equal(calls,0);
});
