import test from 'node:test';import assert from 'node:assert/strict';
import {buildReferenceJobRequest} from '../src/reference-job.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import zlib from 'node:zlib';

// inputForward 必须保持长宽比：非等比缩放会把照片拉伸后喂给模型。
// 这里验证 3:2 与 2:3 都得到同一缩放因子与居中偏移。
// 声明：这是产品侧的选择（等比缩放+居中），**不是**原版规则；
// 原版用的是194点人脸相似变换（fit194），取色路径没有人脸点，故不套用。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
function req(W,H){
 const mask=new Uint8Array(W*H).fill(255);
 return buildReferenceJobRequest({
  originalPixels:(()=>{const d=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++)d[i*4+3]=255;return d;})(),
  originalWidth:W,originalHeight:H,
  workingPhoto:{data:new Uint8Array(W*H*3).fill(50),width:W,height:H,stride:W*3,format:301},
  currentMask:{data:mask,width:W,height:H,stride:W},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:mask,width:W,height:H,stride:W},
  secondaryTestMask:null,intensity:1,referenceRevision:1});
}

test('inputForward preserves aspect ratio instead of stretching',()=>{
 const a=req(1600,1067), b=req(1067,1600), c=req(1600,1600);
 for(const r of [a,b,c]){
  const [sx,,ox,,sy,oy]=Array.from(r.geometry.inputForward);
  assert.equal(sx,sy,'两轴缩放必须相等（等比）');
  assert.ok(Number.isFinite(ox)&&Number.isFinite(oy));
 }
 // 横图：左右铺满、上下留边
 const [ax,,aox,,ay,aoy]=Array.from(a.geometry.inputForward);
 assert.ok(Math.abs(ax*1600-768)<1e-3,'横图宽度应铺满768');
 assert.ok(aoy>0,'横图上下留边');
 assert.ok(Math.abs(aox)<1e-3);
 // 竖图：上下铺满、左右留边
 const [bx,,box,,by,boy]=Array.from(b.geometry.inputForward);
 assert.ok(Math.abs(by*1600-768)<1e-3,'竖图高度应铺满768');
 assert.ok(box>0,'竖图左右留边');
 // 方图：无留边
 const [cx,,cox,,cy,coy]=Array.from(c.geometry.inputForward);
 assert.ok(Math.abs(cox)<1e-3&&Math.abs(coy)<1e-3);
});
