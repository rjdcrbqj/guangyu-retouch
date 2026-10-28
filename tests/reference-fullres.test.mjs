import test from 'node:test';import assert from 'node:assert/strict';
import {buildReferenceJobRequest} from '../src/reference-job.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import zlib from 'node:zlib';

// 派生照片必须保留原图分辨率，而不是被降到<=1600的工作分辨率。
// 管线本身支持全分辨率ROI（<=4096），所以这是接线问题，不是能力问题。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}

test('the derived photo keeps the full original resolution, not the working resolution',()=>{
 // 原图 3000x2000（>1600），工作分辨率会是 1600x1067。
 const OW=3000,OH=2000, WW=1600,WH=1067;
 const rgba=new Uint8Array(OW*OH*4);          // 全分辨率原图像素
 for(let i=0;i<OW*OH;i++)rgba.set([10,20,30,255],i*4);
 const workMask=new Uint8Array(WW*WH).fill(255); // 工作分辨率的选区
 const r=buildReferenceJobRequest({
  originalPixels:rgba,originalWidth:OW,originalHeight:OH,
  workingPhoto:{data:new Uint8Array(WW*WH*3).fill(50),width:WW,height:WH,stride:WW*3,format:301},
  currentMask:{data:workMask,width:WW,height:WH,stride:WW},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:workMask,width:WW,height:WH,stride:WW},
  secondaryTestMask:null,intensity:1,referenceRevision:1});
 // 原图必须保持全分辨率
 assert.equal(r.original.width,OW);
 assert.equal(r.original.height,OH);
 // ROI 现在是选区包围盒（选区覆盖整幅时等于整幅）
 const [rx,ry,rw,rh]=Array.from(r.geometry.originalROI);
 assert.ok(rx>=0&&ry>=0&&rw>0&&rh>0);
 assert.ok(rx+rw<=OW&&ry+rh<=OH,'ROI必须落在原图内');
 assert.ok(rw<=4096&&rh<=4096,'ROI必须<=4096');
 // 工作图与选区保持工作分辨率（模型输入是768²，蒙版按自身WH采样）
 assert.equal(r.workingPhoto.width,WW);
 assert.equal(r.temporaryMask.width,WW);
});

test('a full-resolution original beyond the ROI limit is rejected rather than downscaled silently',()=>{
 const OW=5000,OH=100,WW=1600,WH=32;
 const rgba=new Uint8Array(OW*OH*4);
 assert.throws(()=>buildReferenceJobRequest({
  originalPixels:rgba,originalWidth:OW,originalHeight:OH,
  workingPhoto:{data:new Uint8Array(WW*WH*3).fill(50),width:WW,height:WH,stride:WW*3,format:301},
  currentMask:{data:new Uint8Array(WW*WH).fill(255),width:WW,height:WH,stride:WW},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:new Uint8Array(WW*WH).fill(255),width:WW,height:WH,stride:WW},
  secondaryTestMask:null,intensity:1,referenceRevision:1}),/4096/);
});

test('blendMask is resampled to the original resolution so the processor accepts it',async()=>{
 const {createRequire}=await import('node:module');
 const require=createRequire(import.meta.url);
 const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
 const {createSkinReferenceHandler}=require('../inference/skin-reference/ipc.cjs');
 const OW=200,OH=140, WW=100,WH=70;
 const rgba=new Uint8Array(OW*OH*4);
 for(let i=0;i<OW*OH;i++)rgba.set([10,20,30,255],i*4);
 const wm=new Uint8Array(WW*WH).fill(255);
 const r=buildReferenceJobRequest({
  originalPixels:rgba,originalWidth:OW,originalHeight:OH,
  workingPhoto:{data:new Uint8Array(WW*WH*3).fill(50),width:WW,height:WH,stride:WW*3,format:301},
  currentMask:{data:wm,width:WW,height:WH,stride:WW},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:wm,width:WW,height:WH,stride:WW},
  secondaryTestMask:null,intensity:1,referenceRevision:1});
 // blendMask 必须已被重采样到原图尺寸
 assert.equal(r.blendMaskStride,OW,'blendMask步长必须等于原图宽度');
 assert.ok(r.blendMask.length>=OW*OH);
 // 且真实processor预检通过（这正是之前报"缺少完整结果掩码"的地方）
 let got=null;
 const processor=new SkinReferenceProcessor({models:{run(i){got=i;return Promise.resolve({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)});},async close(){}}});
 const handler=createSkinReferenceHandler({processor});
 const out=await handler({},r);
 assert.ok(got,'后端必须收到四输入');
 assert.equal(out.output.length,OW*OH*4,'输出必须是原图尺寸的整幅帧');
 await processor.close();
});
