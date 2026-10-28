import test from 'node:test';import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {buildReferenceJobRequest} from '../src/reference-job.js';
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([20,40,60,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
const W=64,H=48;
function supplies(over={}){
 const rgba=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++)rgba.set([11,22,33,255],i*4);
 return {originalPixels:rgba,originalWidth:W,originalHeight:H,
  workingPhoto:{data:new Uint8Array(W*H*3).fill(77),width:W,height:H,stride:W*3,format:301},
  currentMask:{data:new Uint8Array(W*H).fill(255),width:W,height:H,stride:W},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:new Uint8Array(W*H).fill(200),width:W,height:H,stride:W},
  secondaryTestMask:null,
  intensity:.4,referenceRevision:7,...over};
}

test('builder no longer manufactures the blend mask: it must be supplied',()=>{
 assert.throws(()=>buildReferenceJobRequest(supplies({blendMask:undefined})),/blendMask/);
 const r=buildReferenceJobRequest(supplies());
 // 必须原样传递调用方供给，而不是全255
 assert.equal(r.blendMask[0],200);
 assert.equal(r.blendMaskStride,W);
 assert.notEqual(r.blendMask[0],255);
});

test('builder does not silently invent a secondary test mask',()=>{
 // 未声明时拒绝
 assert.throws(()=>buildReferenceJobRequest(supplies({secondaryTestMask:undefined})),/secondaryTestMask/);
 // 显式声明"无二次保护区域"才允许，且结果必须如实标记
 const r=buildReferenceJobRequest(supplies({secondaryTestMask:null}));
 assert.equal(r.secondaryTestMask.every(v=>v===0),true);
 assert.equal(r.secondaryTestMaskDeclaredEmpty,true);
 // 真实供给时原样传递并标记非空
 const real=buildReferenceJobRequest(supplies({secondaryTestMask:{data:new Uint8Array(W*H).fill(9),width:W,height:H,stride:W}}));
 assert.equal(real.secondaryTestMask[0],9);
 assert.equal(real.secondaryTestMaskDeclaredEmpty,false);
});

test('a supplied blend mask keeps its own values and stride',()=>{
 const m=new Uint8Array(W*H);m[5]=123;
 const r=buildReferenceJobRequest(supplies({blendMask:{data:m,width:W,height:H,stride:W}}));
 assert.equal(r.blendMask[5],123);assert.equal(r.blendMask[4],0);
 assert.equal(r.blendMask.length,W*H);
 assert.throws(()=>buildReferenceJobRequest(supplies({blendMask:{data:new Uint8Array(3),width:W,height:H,stride:W}})),/blendMask/);
 // 尺寸与工作图不符也必须拒绝
 assert.throws(()=>buildReferenceJobRequest(supplies({blendMask:{data:new Uint8Array(4),width:2,height:2,stride:2}})),/blendMask/);
});
