import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {encodeReferencePNG64} from '../src/reference-png.js';
const require=createRequire(import.meta.url);
const {decodeSuppliedReferencePNG64}=require('../inference/skin-reference/straw-png.cjs');
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';

// 目标：自己产出规范PNG，不依赖浏览器canvas的chunk布局。
// 必须能通过产品自身的严格解码器（只允许IHDR/IDAT/IEND、IEND在精确结尾、alpha全255）。

function patch(fill){
 const d=new Uint8Array(64*64*4);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;const [r,g,b]=fill(x,y);d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255;}
 return d;
}

test('encodes a 64x64 RGBA patch that the strict product decoder accepts',async()=>{
 const rgba=patch((x,y)=>[x*4%256,y*4%256,(x+y)*2%256]);
 const png=await encodeReferencePNG64(rgba);
 const out=decodeSuppliedReferencePNG64({data:png,policy:POLICY});
 assert.equal(out.width,64);assert.equal(out.height,64);assert.equal(out.format,301);
 // 逐RGB还原
 for(let i=0;i<4096;i++){
  assert.equal(out.data[i*3],rgba[i*4]);
  assert.equal(out.data[i*3+1],rgba[i*4+1]);
  assert.equal(out.data[i*3+2],rgba[i*4+2]);
 }
 // 必须只有规范chunk
 assert.deepEqual(out.metadata.chunkTypes,['IHDR','IDAT','IEND']);
 assert.deepEqual(out.metadata.ancillaryChunkTypes,[]);
});

test('encodes the exact chunk set and byte layout the decoder requires',async()=>{
 const png=await encodeReferencePNG64(patch(()=>[9,9,9]));
 const buf=Buffer.from(png);
 // 签名
 assert.deepEqual(Array.from(png.subarray(0,8)),[137,80,78,71,13,10,26,10]);
 // 首chunk必须是IHDR，长度13
 assert.equal(buf.toString('latin1',12,16),'IHDR');
 assert.equal(buf.readUInt32BE(8),13);
 // 末chunk必须是IEND且正好到结尾
 const last12=png.length-12;
 assert.equal(buf.toString('latin1',last12+4,last12+8),'IEND');
 assert.equal(buf.readUInt32BE(last12),0);
 // IHDR: 64x64, 8bit, color6(RGBA), 0/0/0
 assert.equal(buf.readUInt32BE(16),64);assert.equal(buf.readUInt32BE(20),64);
 assert.equal(png[24],8);assert.equal(png[25],6);assert.equal(png[26],0);assert.equal(png[27],0);assert.equal(png[28],0);
 // 不接受非64或alpha非255
 await assert.rejects(encodeReferencePNG64(new Uint8Array(64*64*4)),/alpha|不透明/);
 await assert.rejects(encodeReferencePNG64(new Uint8Array(63*63*4)),TypeError);
 await assert.rejects(encodeReferencePNG64(new Uint8Array(64*64*3)),TypeError);
});

test('encoder output is deterministic and does not mutate the caller',async()=>{
 const rgba=patch((x,y)=>[x%256,y%256,(x*y)%256]),before=rgba.slice();
 const a=await encodeReferencePNG64(rgba),b=await encodeReferencePNG64(rgba);
 assert.deepEqual(Array.from(a),Array.from(b));
 assert.deepEqual(rgba,before);
});
