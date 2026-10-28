import test from 'node:test';import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {buildReferenceJobRequest} from '../src/reference-job.js';
const require=createRequire(import.meta.url);
const {createSkinReferenceHandler}=require('../inference/skin-reference/ipc.cjs');
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');

// 端到端：渲染端组装 -> IPC适配 -> 真实processor预检 -> 假后端。
// 不加载ONNX、不运行NN、不打开原版。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
function supplies(){
 const w=64,h=48;
 const rgba=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++)rgba.set([11,22,33,255],i*4);
 return {originalPixels:rgba,originalWidth:w,originalHeight:h,
  workingPhoto:{data:new Uint8Array(w*h*3).fill(77),width:w,height:h,stride:w*3,format:301},
  currentMask:{data:new Uint8Array(w*h).fill(255),width:w,height:h,stride:w},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:new Uint8Array(w*h).fill(255),width:w,height:h,stride:w},
  secondaryTestMask:null,
  intensity:.4,referenceRevision:7};
}

test('renderer-built request flows through the IPC adapter into the real processor',async()=>{
 const request=buildReferenceJobRequest(supplies());
 let got=null;
 const processor=new SkinReferenceProcessor({models:{run(input){got=input;return Promise.resolve({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(-1)});},async close(){}}});
 const handler=createSkinReferenceHandler({processor});
 const result=await handler({},request);
 assert.equal(result.referenceRevision,7);
 assert.ok(got,'后端必须收到四输入');
 // 四输入形状：768²当前图/蒙版，64²参考彩图/蒙版
 assert.equal(got.photo.length,3*768*768);
 assert.equal(got.currentMask.length,768*768);
 assert.equal(got.reference.length,3*64*64);
 assert.equal(got.referenceMask.length,64*64);
 // 参考蒙版值必须来自供给（255 -> 1.0），不是默认零
 assert.equal(got.referenceMask[0],Math.fround(255*Math.fround(1/255)));
 await processor.close();
});

test('the IPC adapter still refuses an encoded string before reaching the processor',async()=>{
 let calls=0;
 const handler=createSkinReferenceHandler({processor:{run(){calls++;},close(){}}});
 const request=buildReferenceJobRequest(supplies());
 await assert.rejects(handler({}, {...request,original:'data:image/png;base64,AAAA'}),/需要已解码原始像素帧/);
 assert.equal(calls,0);
});
