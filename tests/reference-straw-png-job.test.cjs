'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform',f=Math.fround;
// 独立生成无filter的四象限PNG；不读取私人照片或重放已有解码验证。
function chunk(name,data){
 const body=Buffer.concat([Buffer.from(name),data]);let crc=0xffffffff;
 for(const b of body){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
const colors=[[9,247,38],[231,17,113],[57,128,203],[184,69,6]];
function png(){
 const raw=Buffer.alloc(64*257),header=Buffer.alloc(13);header.writeUInt32BE(64);header.writeUInt32BE(64,4);header[8]=8;header[9]=6;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([...colors[(y>=32?2:0)+(x>=32?1:0)],255],y*257+1+x*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function request(){
 const source=new Uint8Array(71*13).fill(65);for(let y=0;y<13;y++)for(let x=0;x<17;x++)source.set([83,129,194,207],y*71+x*4);
 return {original:{data:source,width:17,height:13,stride:71,channels:4},workingPhoto:{data:new Uint8Array(17*13*3).fill(111),width:17,height:13,stride:51,format:301},
  temporaryMask:{data:new Uint8Array(17*13).fill(157),width:17,height:13,stride:17},
  geometry:{valid:true,originalROI:Int32Array.from([2,3,8,6]),inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0])},
  referencePNG:{data:png(),policy:POLICY},referenceMask:{data:new Uint8Array(4096).fill(107),width:64,height:64,stride:64},
  blendMask:new Uint8Array(48).fill(255),blendMaskStride:8,secondaryTestMask:new Uint8Array(48).fill(1),secondaryTestMaskStride:8,intensity:.73,referenceRevision:146};
}
test('processor decodes explicit straw PNG before await and preserves its separate reference mask',async()=>{
 const r=request(),encoded=r.referencePNG.data,shared=new Uint8Array(new SharedArrayBuffer(encoded.length+23));shared.set(encoded,11);r.referencePNG.data=shared.subarray(11,11+encoded.length);
 const mask=new Uint8Array(new SharedArrayBuffer(4109));mask.fill(107);r.referenceMask.data=mask.subarray(7,4103);
 let release,calls=0,closes=0,input;const waiting=new Promise(resolve=>{release=resolve;});
 const p=new SkinReferenceProcessor({models:{run(v){calls++;input=v;return waiting;},async close(){closes++;}}});
 const before=r.original.data.slice(),job=p.run(r);job.catch(()=>{});assert.equal(calls,1);
 shared.fill(0);mask.fill(0);r.referencePNG.policy='changed';r.referenceRevision=147;
 try{
  for(let c=0;c<3;c++)for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(input.reference[c*4096+y*64+x],f(f(colors[(y>=32?2:0)+(x>=32?1:0)][c]-127.5)*f(1/127.5)));
  assert.equal(input.referenceMask.every(v=>v===f(107*f(1/255))),true);
  release({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(-1)});
  const out=await job;assert.deepEqual(out.output,before);assert.deepEqual(r.original.data,before);assert.equal(out.referenceRevision,146);assert.equal(out.secondary.trigger,false);
 }finally{await p.close();}
 assert.equal(closes,1);
});
test('processor refuses simultaneous prepared reference photo and encoded PNG before backend',async()=>{
 let calls=0;const p=new SkinReferenceProcessor({models:{run(){calls++;throw Error('backend must not run');},async close(){}}});
 try{for(const photo of [null,{data:new Uint8Array(12288),width:64,height:64,stride:192,format:301}]){const r=request();r.referencePhoto=photo;await assert.rejects(p.run(r),/参考.*冲突/);}assert.equal(calls,0);}finally{await p.close();}
});
test('processor requires PNG policy and a separately supplied reference mask before backend',async()=>{
 let calls=0;const p=new SkinReferenceProcessor({models:{run(){calls++;throw Error('backend must not run');},async close(){}}});
 try{
  const noPolicy=request();delete noPolicy.referencePNG.policy;await assert.rejects(p.run(noPolicy),/PNG/);
  const corrupt=request();corrupt.referencePNG.data[29]^=1;await assert.rejects(p.run(corrupt),/PNG/);
  const noMask=request();delete noMask.referenceMask;await assert.rejects(p.run(noMask),/参考蒙版/);assert.equal(calls,0);
 }finally{await p.close();}
});
