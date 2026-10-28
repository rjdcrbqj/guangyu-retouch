import test from 'node:test';import assert from 'node:assert/strict';
import {buildReferenceJobRequest} from '../src/reference-job.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import zlib from 'node:zlib';

// 空选区时不应提交作业：blendMask 全零意味着没有任何像素允许改变，
// 结果必然与原件逐字节相同——白跑一次模型、还生成一张无意义的派生照片。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
const W=64,H=48;
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
function supplies(maskFill){
 const rgba=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++)rgba.set([10,20,30,255],i*4);
 return {originalPixels:rgba,originalWidth:W,originalHeight:H,
  workingPhoto:{data:new Uint8Array(W*H*3).fill(50),width:W,height:H,stride:W*3,format:301},
  currentMask:{data:new Uint8Array(W*H).fill(maskFill),width:W,height:H,stride:W},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:new Uint8Array(W*H).fill(maskFill),width:W,height:H,stride:W},
  secondaryTestMask:null,intensity:1,referenceRevision:1};
}

test('an all-zero blend mask is rejected before the model runs',()=>{
 assert.throws(()=>buildReferenceJobRequest(supplies(0)),/选区|blendMask|空白/);
});

test('a non-empty selection still builds normally',()=>{
 const r=buildReferenceJobRequest(supplies(255));
 assert.equal(r.blendMask.length,W*H);
 assert.equal(r.blendMask[0],255);
});
