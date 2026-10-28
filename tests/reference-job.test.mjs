import test from 'node:test';import assert from 'node:assert/strict';
import {buildReferenceJobRequest} from '../src/reference-job.js';
import zlib from 'node:zlib';
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]);const out=Buffer.alloc(data.length+12);
 out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;}
function realPNG64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([20,40,60,255],y*257+1+x*4);
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(64);ihdr.writeUInt32BE(64,4);ihdr[8]=8;ihdr[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
import {SkinReferenceProcessor} from '../inference/skin-reference/processor.cjs';

// 目标：把产品自身数据组装成 processor.run 真正接受的请求，且不制造默认值。
// 几何取“整幅工作图 -> 768 模型输入”的真实比例，非虚构回退；超出已验证ROI上限即拒绝。

function rgba(w,h){const d=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++)d.set([10,20,30,255],i*4);return d;}
function mono(w,h,v=255){return new Uint8Array(w*h).fill(v);}
function base(over={}){
 return {originalPixels:rgba(120,80),originalWidth:120,originalHeight:80,
  workingPhoto:{data:new Uint8Array(120*80*3).fill(50),width:120,height:80,stride:360,format:301},
  currentMask:{data:mono(120,80),width:120,height:80,stride:120},
  referencePNG:{data:realPNG64(),policy:POLICY},
  referenceMask:{data:mono(64,64),width:64,height:64,stride:64},
  blendMask:{data:new Uint8Array(120*80).fill(255),width:120,height:80,stride:120},
  secondaryTestMask:null,
  intensity:.5,referenceRevision:3,...over};
}

test('builds a request the existing processor accepts, with whole-image geometry',()=>{
 const r=buildReferenceJobRequest(base());
 assert.equal(r.geometry.valid,true);
 assert.deepEqual(Array.from(r.geometry.originalROI),[0,0,120,80]);
 assert.equal(r.geometry.inputForward instanceof Float32Array,true);
 assert.equal(r.geometry.postAffine instanceof Float32Array,true);
 // 工作图 -> 768 必须等比缩放（不能两轴各自拉伸），横图上下留边
 const uni=Math.fround(768/120);
 assert.equal(r.geometry.inputForward[0],uni);
 assert.equal(r.geometry.inputForward[4],uni);
 assert.ok(r.geometry.inputForward[5]>0,'横图应有纵向留边');
 // 结果掩码必须覆盖整个ROI
 assert.equal(r.blendMask.length>=120*80,true);
 assert.equal(r.blendMaskStride,120);
 assert.equal(r.secondaryTestMaskStride,120);
 assert.equal(r.original.channels,4);
 assert.equal(r.referenceRevision,3);
});

test('the built request passes the real processor preflight without touching the backend',async()=>{
 let calls=0;
 const p=new SkinReferenceProcessor({models:{run(){calls++;throw Error('backend must not run');},async close(){}}});
 try{await assert.rejects(p.run(buildReferenceJobRequest(base())),/backend must not run/);}
 finally{await p.close();}
 assert.equal(calls,1,'预检通过后应到达后端（此处故意抛错）');
});

test('rejects an ROI beyond the validated 4096 limit instead of silently downscaling',()=>{
 const big={originalPixels:rgba(5000,10),originalWidth:5000,originalHeight:10,
  workingPhoto:{data:new Uint8Array(5000*10*3),width:5000,height:10,stride:15000,format:301},
  currentMask:{data:mono(5000,10),width:5000,height:10,stride:5000},
  referencePNG:{data:realPNG64(),policy:POLICY},
  referenceMask:{data:mono(64,64),width:64,height:64,stride:64},
  blendMask:{data:mono(5000,10),width:5000,height:10,stride:5000},
  secondaryTestMask:null,intensity:.5,referenceRevision:0};
 assert.throws(()=>buildReferenceJobRequest(big),/4096/);
});

test('rejects missing or inconsistent supplies rather than filling them in',()=>{
 assert.throws(()=>buildReferenceJobRequest(),TypeError);
 assert.throws(()=>buildReferenceJobRequest(base({referenceMask:undefined})),/referenceMask/);
 assert.throws(()=>buildReferenceJobRequest(base({currentMask:undefined})),/currentMask/);
 assert.throws(()=>buildReferenceJobRequest(base({intensity:undefined})),/intensity/);
 assert.throws(()=>buildReferenceJobRequest(base({referenceRevision:-1})),/referenceRevision/);
 // 原图现在允许与工作图分辨率不同（派生照片保留原图尺寸）；但像素缓冲区必须真的够大
 assert.throws(()=>buildReferenceJobRequest(base({originalWidth:400})),/原始像素帧|4096/);
 // currentMask 是模型输入侧选区，允许与工作图不同分辨率；但必须是完整BYTE1
 assert.throws(()=>buildReferenceJobRequest(base({currentMask:{data:new Uint8Array(4),width:10,height:10,stride:10}})),TypeError);
});
