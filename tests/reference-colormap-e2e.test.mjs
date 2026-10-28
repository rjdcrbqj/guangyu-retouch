import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import zlib from 'node:zlib';
import {buildReferenceJobRequest} from '../src/reference-job.js';
const {loadNormalSourceReferenceColorMap}=require('../inference/skin-reference/default-lut.cjs');
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
const {createSkinReferenceHandler}=require('../inference/skin-reference/ipc.cjs');

// 端到端：colorMapRequired 经 builder -> IPC -> processor -> prepared-result 真正生效，
// 不是只通过 builder 就断了。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
function base(over={}){
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

test('colorMapRequired flows end to end and the processor applies the LUT',async()=>{
 // 使用 default-lut 的真实 colorMap 供给（满足完整契约）
 const {colorMap}=loadNormalSourceReferenceColorMap({policy:'normal-source-icc-gamma-off-generic-code4'});
 const req=buildReferenceJobRequest(base({colorMapRequired:true,colorMap}));
 assert.equal(req.colorMapRequired,true);
 let got=null;
 const processor=new SkinReferenceProcessor({models:{run(i){got=i;return Promise.resolve({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)});},async close(){}}});
 const handler=createSkinReferenceHandler({processor});
 const out=await handler({},req);
 // colorMapApplied 应被置 true
 assert.equal(out.colorMapApplied,true,'processor应报告colorMap已应用');
 await processor.close();
});

test('without colorMapRequired the processor never applies a LUT',async()=>{
 const req=buildReferenceJobRequest(base());
 assert.equal('colorMapRequired' in req,false);
 const processor=new SkinReferenceProcessor({models:{run(){return Promise.resolve({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)});},async close(){}}});
 const handler=createSkinReferenceHandler({processor});
 const out=await handler({},req);
 assert.notEqual(out.colorMapApplied,true,'未声明时不得应用colorMap');
 await processor.close();
});
