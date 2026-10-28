'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function api(){return require('../inference/skin-reference/straw-png.cjs').decodeSuppliedReferencePNG64;}
// Independent bitwise CRC, without the production lookup table.
function chunk(type,bytes){
 const body=Buffer.concat([Buffer.from(type),Buffer.from(bytes)]);let crc=0xffffffff;
 for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 const size=Buffer.alloc(4),end=Buffer.alloc(4);size.writeUInt32BE(bytes.length);end.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([size,body,end]);
}
function fixture({alpha=255,width=64,extra=[],compressedTail=false}={}){
 const h=64,rowBytes=width*4,rgba=Buffer.alloc(rowBytes*h),rgb=Buffer.alloc(width*h*3);
 for(let y=0;y<h;y++)for(let x=0;x<width;x++){
  const p=(y*width+x)*4,q=(y*width+x)*3;
  rgba[p]=rgb[q]=(x*17+y*3)%256;rgba[p+1]=rgb[q+1]=(x*5+y*11+73)%256;rgba[p+2]=rgb[q+2]=(x*13+y*7+191)%256;rgba[p+3]=alpha;
 }
 const raw=Buffer.alloc(h*(rowBytes+1));
 for(let y=0;y<h;y++){
  const filter=y%5;raw[y*(rowBytes+1)]=filter;
  for(let x=0;x<rowBytes;x++){
   const p=y*rowBytes+x,left=x>=4?rgba[p-4]:0,up=y?rgba[p-rowBytes]:0,corner=y&&x>=4?rgba[p-rowBytes-4]:0;
   let predict=0;
   if(filter===1)predict=left;
   if(filter===2)predict=up;
   if(filter===3)predict=(left+up)>>>1;
   if(filter===4){const target=left+up-corner;predict=[left,up,corner].reduce((best,v)=>Math.abs(target-v)<Math.abs(target-best)?v:best);}
   raw[y*(rowBytes+1)+x+1]=(rgba[p]-predict)&255;
  }
 }
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(width);hdr.writeUInt32BE(h,4);hdr[8]=8;hdr[9]=6;
 const compressed=Buffer.concat([zlib.deflateSync(raw),compressedTail?Buffer.from([9]):Buffer.alloc(0)]);
 return {rgb,png:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),...extra.map(([t,b])=>chunk(t,b)),chunk('IDAT',compressed.subarray(0,15)),chunk('IDAT',compressed.subarray(15)),chunk('IEND',[])])};
}
test('straw PNG reconstructs all five filters into owned RGB64 without metadata transforms',()=>{
 const decode=api(),{png,rgb}=fixture({extra:[['eXIf',[1,2,3]],['iTXt',[8,9]]]});
 const shared=new Uint8Array(new SharedArrayBuffer(png.length+7));shared.set(png,3);const input=shared.subarray(3,3+png.length),before=input.slice();
 const result=decode({data:input,policy:POLICY});
 assert.deepEqual([result.width,result.height,result.stride,result.format],[64,64,192,301]);
 assert.deepEqual(Buffer.from(result.data),rgb);assert.deepEqual(input,before);
 assert.equal(result.metadata.transformApplied,false);assert.equal(result.metadata.orientationParsed,false);
 assert.deepEqual(result.metadata.ancillaryChunkTypes,['eXIf','iTXt']);assert.equal(result.data.buffer instanceof SharedArrayBuffer,false);
 result.data[0]=255;assert.deepEqual(input,before);
});
test('straw PNG refuses any alpha below255 instead of compositing or dropping it',()=>{
 const decode=api();for(const alpha of [0,127,254])assert.throws(()=>decode({data:fixture({alpha}).png,policy:POLICY}),/alpha/i);
});
test('straw PNG rejects corrupt chunks, compressed suffixes, wrong shape and appended file bytes',()=>{
 const decode=api(),{png}=fixture(),bad=Buffer.from(png);bad[29]^=1;
 for(const data of [bad,fixture({compressedTail:true}).png,fixture({width:63}).png,Buffer.concat([png,Buffer.from([0])]),png.subarray(0,png.length-2)])assert.throws(()=>decode({data,policy:POLICY}));
});
test('straw PNG requires explicit raw sample policy and rejects unsupported metadata',()=>{
 const decode=api(),{png}=fixture();assert.throws(()=>decode({data:png}));
 for(const type of ['sRGB','gAMA','iCCP','tRNS','PLTE'])assert.throws(()=>decode({data:fixture({extra:[[type,[0]]]}).png,policy:POLICY}));
 assert.throws(()=>decode({data:new Uint8Array(1048577),policy:POLICY}));
});
test('straw PNG refuses high-bit chunk names even when their low7 bits spell allowed metadata',()=>{
 const decode=api();
 const disguised=fixture({extra:[[Buffer.from([0xe5,0x58,0x49,0x66]),[1,2]]]});
 assert.throws(()=>decode({data:disguised.png,policy:POLICY}),/chunk/);
});
