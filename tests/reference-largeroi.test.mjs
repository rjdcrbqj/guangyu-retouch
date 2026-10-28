import test from 'node:test';import assert from 'node:assert/strict';
import {buildReferenceJobRequest} from '../src/reference-job.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import zlib from 'node:zlib';

// 大型照片（超过4096）必须仍可使用参考，并且派生照片保持原图分辨率。
// 做法：original保持全分辨率，ROI取一个<=4096的子矩形（选区包围盒）。
// 若选区包围盒本身超过4096，则明确拒绝而不是悄悄缩小。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}

function mk(OW,OH,selRect){
 // 选区在画布分辨率；这里直接用原图分辨率的选区以简化映射
 const fmt=(w,h,fx,fy)=>{const d=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(fx(x,y))d[y*w+x]=255;return d;};
 const mask=fmt(OW,OH,selRect);
 return {
  originalPixels:(()=>{const d=new Uint8Array(OW*OH*4);for(let i=0;i<OW*OH;i++)d[i*4+3]=255;return d;})(),
  originalWidth:OW,originalHeight:OH,
  workingPhoto:{data:new Uint8Array(1600*1067*3).fill(50),width:1600,height:1067,stride:1600*3,format:301},
  currentMask:{data:mask,width:OW,height:OH,stride:OW},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:mask,width:OW,height:OH,stride:OW},
  secondaryTestMask:null,intensity:1,referenceRevision:1};
}

test('a photo larger than 4096 still builds, with a capped ROI inside the full-res original',()=>{
 // 6000x4000，选区集中在中央 800x600
 const r=buildReferenceJobRequest(mk(6000,4000,(x,y)=>x>=2600&&x<3400&&y>=1700&&y<2300));
 assert.equal(r.original.width,6000,'original保持全分辨率');
 assert.equal(r.original.height,4000);
 const [rx,ry,rw,rh]=Array.from(r.geometry.originalROI);
 assert.ok(rw<=4096&&rh<=4096,'ROI必须<=4096');
 // ROI 必须覆盖选区
 assert.ok(rx<=2600&&ry<=1700&&rx+rw>=3400&&ry+rh>=2300,'ROI应覆盖选区');
});

test('a selection larger than 4096 is rejected explicitly, not silently shrunk',()=>{
 // 选区几乎覆盖整张 6000x4000 图：包围盒超过 4096
 assert.throws(()=>buildReferenceJobRequest(mk(6000,4000,()=>true)),/4096/);
});
