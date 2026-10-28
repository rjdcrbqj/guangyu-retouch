import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cropReferencePatch,requireFullReferencePatch} from '../src/reference-pick.js';
import {encodeReferencePNG64} from '../src/reference-png.js';
import {buildReferenceJobRequest} from '../src/reference-job.js';
const require=createRequire(import.meta.url);
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
const {createSkinReferenceHandler}=require('../inference/skin-reference/ipc.cjs');
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';

// 端到端：真实取色路径（裁剪->规范编码->组装->IPC->真实processor预检->假后端）。
// 不加载ONNX、不跑NN、不打开原版。

const W=200,H=160;
function rgba(w=W,h=H){const d=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;d[i]=(x*3)%256;d[i+1]=(y*5)%256;d[i+2]=((x+y)*2)%256;d[i+3]=255;}return d;}

test('a patch produced by the real pick path is accepted by the strict decoder and the processor',async()=>{
 const pixels=rgba();
 const patch=cropReferencePatch({data:pixels,width:W,height:H,point:[100,80]});
 requireFullReferencePatch(patch.rect);
 assert.equal(patch.width,64);assert.equal(patch.height,64);assert.equal(patch.stride,256);
 const png=await encodeReferencePNG64(patch.data);
 const request=buildReferenceJobRequest({
  originalPixels:pixels,originalWidth:W,originalHeight:H,
  workingPhoto:{data:new Uint8Array(W*H*3).fill(50),width:W,height:H,stride:W*3,format:301},
  currentMask:{data:new Uint8Array(W*H).fill(255),width:W,height:H,stride:W},
  referencePNG:{data:png,policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:new Uint8Array(W*H).fill(255),width:W,height:H,stride:W},
  secondaryTestMask:null,
  intensity:.5,referenceRevision:4});
 let got=null;
 const processor=new SkinReferenceProcessor({models:{run(i){got=i;return Promise.resolve({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(-1)});},async close(){}}});
 const handler=createSkinReferenceHandler({processor});
 const out=await handler({},request);
 assert.equal(out.referenceRevision,4);
 assert.ok(got,'后端必须收到四输入');
 const f=Math.fround,scale=f(1/127.5);
 for(const c of [0,1,2]){
  const expect=f(f(patch.data[c]-127.5)*scale);
  assert.equal(got.reference[c*4096],expect,'通道'+c+'首像素必须来自裁剪结果');
 }
 assert.equal(got.referenceMask.length,4096);
 await processor.close();
});

test('the product pick path refuses an edge point whose crop cannot reach 64x64',()=>{
 const pixels=rgba();
 const edge=cropReferencePatch({data:pixels,width:W,height:H,point:[W-1,H-1]});
 assert.notEqual(edge.width,64);
 assert.throws(()=>requireFullReferencePatch(edge.rect),/64/);
 const small=rgba(64,48);
 assert.throws(()=>requireFullReferencePatch(cropReferencePatch({data:small,width:64,height:48,point:[20,15]}).rect),/64/);
});

test('the pick path rejects a patch whose alpha is not fully opaque',async()=>{
 const bad=new Uint8Array(64*64*4);for(let i=0;i<64*64;i++){bad[i*4]=1;bad[i*4+3]=254;}
 await assert.rejects(encodeReferencePNG64(bad),/alpha|不透明/);
});
