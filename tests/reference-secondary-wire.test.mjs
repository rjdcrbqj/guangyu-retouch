import test from 'node:test';import assert from 'node:assert/strict';
import {buildReferenceJobRequest} from '../src/reference-job.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import zlib from 'node:zlib';

// secondary 阶段（protection/preparation/postblend）已被 processor 消费，但 builder 丢弃了它们，
// 导致 GUI 供给无法到达。这是与 colorMap 同类的接入缺口。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
function supplies(over={}){
 const W=64,H=64;
 const rgba=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++)rgba.set([10,20,30,255],i*4);
 const mask=new Uint8Array(W*H).fill(255);
 return {originalPixels:rgba,originalWidth:W,originalHeight:H,
  workingPhoto:{data:new Uint8Array(W*H*3).fill(50),width:W,height:H,stride:W*3,format:301},
  currentMask:{data:mask,width:W,height:H,stride:W},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:mask,width:W,height:H,stride:W},
  secondaryTestMask:null,intensity:1,referenceRevision:1,...over};
}

test('builder passes secondaryProtection/secondaryPostBlend through when supplied',()=>{
 const prot=new Uint8Array(64*64).fill(200);
 const r=buildReferenceJobRequest(supplies({secondaryProtection:prot,secondaryProtectionStride:64,
  secondaryPostBlend:{mask2:new Uint8Array(64*64),mask2Stride:64,tableA:new Uint8Array(256),tableB:new Uint8Array(256),rounding:'nearest-even'}}));
 assert.equal(r.secondaryProtection,prot);
 assert.equal(r.secondaryProtectionStride,64);
 assert.equal(r.secondaryPostBlend.mask2Stride,64);
});

test('builder does not fabricate secondary fields when absent',()=>{
 const r=buildReferenceJobRequest(supplies());
 assert.equal('secondaryProtection' in r,false);
 assert.equal('secondaryPreparation' in r,false);
 assert.equal('secondaryPostBlend' in r,false);
});
