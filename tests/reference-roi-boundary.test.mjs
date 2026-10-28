import test from 'node:test';import assert from 'node:assert/strict';
import {buildReferenceJobRequest} from '../src/reference-job.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import zlib from 'node:zlib';

// ROI 上限边界：恰好 4096 应通过，4097 应拒绝。此前只测了"超限拒绝"，未测精确边界。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
function build(W,H,selW,selH){
 const rgba=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++)rgba[i*4+3]=255;
 const mask=new Uint8Array(W*H);
 // 选区包围盒 = selW x selH（从原点开始）
 for(let y=0;y<Math.min(selH,H);y++)for(let x=0;x<Math.min(selW,W);x++)mask[y*W+x]=255;
 return {originalPixels:rgba,originalWidth:W,originalHeight:H,
  workingPhoto:{data:new Uint8Array(W*H*3).fill(50),width:W,height:H,stride:W*3,format:301},
  currentMask:{data:mask,width:W,height:H,stride:W},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:mask,width:W,height:H,stride:W},
  secondaryTestMask:null,intensity:1,referenceRevision:1};
}

test('a selection bbox of exactly 4096x4096 is accepted',()=>{
 const r=buildReferenceJobRequest(build(4096,4096,4096,4096));
 const [, , w,h]=Array.from(r.geometry.originalROI);
 assert.equal(w,4096);assert.equal(h,4096);
});

test('a selection bbox of 4097 is rejected',()=>{
 assert.throws(()=>buildReferenceJobRequest(build(4097,4096,4097,4096)),/4096/);
});
