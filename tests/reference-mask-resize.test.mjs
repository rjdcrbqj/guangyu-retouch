import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {cropReferenceMaskRaw}=require('../src/reference-pick.js');
const {withResizedReferenceMask}=require('../inference/skin-reference/ipc.cjs');
const {resizeReferenceMono64}=require('../inference/skin-reference/mono64.cjs');
const {createSkinReferenceHandler}=require('../inference/skin-reference/ipc.cjs');
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
import zlib from 'node:zlib';
import {buildReferenceJobRequest} from '../src/reference-job.js';
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t2,d){const body=Buffer.concat([Buffer.from(t2),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}

// 参考蒙版放大到64×64必须走产品已验证的 native code2 标量数学（mono64），
// 不能使用任何自造插值。渲染端只裁切，主进程适配层负责放大。

function src(w,h,fn){const d=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)d[y*w+x]=fn(x,y);return d;}

test('the adapter resizes a mask crop with the verified mono64, byte for byte',()=>{
 const W=90,H=70;
 const full=src(W,H,(x,y)=>(x*11+y*3+5)%256);
 for (const point of [[45,35],[10,10],[W-1,H-1]]) {
  const crop=cropReferenceMaskRaw({data:full,width:W,height:H,stride:W,point});
  const got=withResizedReferenceMask({referenceMaskCrop:{...crop}});
  assert.equal(got.referenceMask.width,64);
  assert.equal(got.referenceMask.height,64);
  assert.equal(got.referenceMask.stride,64);
  // 基准：直接调用已验证模块
  const ref=resizeReferenceMono64({data:crop.data,width:crop.width,height:crop.height,stride:crop.stride,math:'native-code2-scalar'});
  assert.deepEqual(Array.from(got.referenceMask.data),Array.from(ref.data),'point '+point);
  // 裁切块字段不得泄漏给 processor
  assert.equal('referenceMaskCrop' in got,false);
 }
});

test('a supplied 64x64 mask is passed through and cannot be combined with a crop',()=>{
 const m={data:new Uint8Array(4096).fill(7),width:64,height:64,stride:64};
 const same=withResizedReferenceMask({referenceMask:m});
 assert.equal(same.referenceMask,m);
 assert.throws(()=>withResizedReferenceMask({referenceMask:m,referenceMaskCrop:{data:new Uint8Array(4096),width:64,height:64,stride:64}}),/不能并用/);
});

test('the adapter rejects an invalid crop instead of guessing',()=>{
 assert.throws(()=>withResizedReferenceMask({referenceMaskCrop:{data:new Uint8Array(4),width:2,height:2,stride:1}}),TypeError);
 assert.throws(()=>withResizedReferenceMask({referenceMaskCrop:{data:new Uint8Array(65*65),width:65,height:65,stride:65}}),TypeError);
 assert.throws(()=>withResizedReferenceMask({referenceMaskCrop:{data:new Uint8Array(4),width:2,height:2,stride:9}}),TypeError);
});

test('full chain: builder passes a mask crop, the adapter resizes it, the processor accepts it',async()=>{
 const W=180,H=140;
 const rgba=new Uint8Array(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;rgba[i]=(x*3)%256;rgba[i+1]=(y*5)%256;rgba[i+2]=((x+y)*2)%256;rgba[i+3]=255;}
 const full=src(W,H,(x,y)=>(x>=60&&x<120&&y>=50&&y<100)?255:0);
 const crop=cropReferenceMaskRaw({data:full,width:W,height:H,stride:W,point:[90,70]});
 const request=buildReferenceJobRequest({
  originalPixels:rgba,originalWidth:W,originalHeight:H,
  workingPhoto:{data:new Uint8Array(W*H*3).fill(50),width:W,height:H,stride:W*3,format:301},
  currentMask:{data:new Uint8Array(W*H).fill(255),width:W,height:H,stride:W},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMaskCrop:{...crop},
  blendMask:{data:new Uint8Array(W*H).fill(255),width:W,height:H,stride:W},
  secondaryTestMask:null,intensity:.5,referenceRevision:1});
 // 渲染端交给IPC的应是裁切块，而不是伪造的64×64
 assert.equal('referenceMask' in request,false);
 assert.equal(request.referenceMaskCrop.width,crop.width);
 // 主进程适配层应当把它放大为64×64并通过processor预检
 let got=null;
 const processor=new SkinReferenceProcessor({models:{run(i){got=i;return Promise.resolve({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(-1)});},async close(){}}});
 const handler=createSkinReferenceHandler({processor});
 const out=await handler({},request);
 assert.equal(out.referenceRevision,1);
 assert.ok(got,'processor必须收到四输入');
 const ref=resizeReferenceMono64({data:crop.data,width:crop.width,height:crop.height,stride:crop.stride,math:'native-code2-scalar'});
 const f=Math.fround,scale=f(1/255);
 for(let i=0;i<64*64;i++)assert.equal(got.referenceMask[i],f(ref.data[i]*scale),'mask byte '+i);
 await processor.close();
});

test('a crop re-derived from a saved pickPoint matches the original crop',async()=>{
 // 重开工程时用同样的裁切规则与取点重建裁切块，必须与原裁切块逐字节一致。
 const W=200,H=160;
 const full=src(W,H,(x,y)=>(x>=70&&x<130&&y>=60&&y<110)?255:0);
 const original=cropReferenceMaskRaw({data:full,width:W,height:H,stride:W,point:[100,80]});
 // 模拟"重开"：同一选区+同一取点再裁一次
 const again=cropReferenceMaskRaw({data:full,width:W,height:H,stride:W,point:[100,80]});
 assert.deepEqual(Array.from(again.data),Array.from(original.data));
 assert.deepEqual(again.rect,original.rect);
 // 不同取点会得到不同裁切块（证明取点确实决定裁切）
 const other=cropReferenceMaskRaw({data:full,width:W,height:H,stride:W,point:[150,120]});
 assert.notDeepEqual(other.rect,original.rect);
});
