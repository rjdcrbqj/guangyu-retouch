'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const api=()=>require('../inference/skin-reference/gray-png.cjs').decodeSuppliedGrayPNG;
const POLICY='encoded-gray8-no-metadata-transform',signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data=Buffer.alloc(0)){const name=Buffer.from(type),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,sum]);}
function header(width,height,tail=[8,0,0,0,0]){const b=Buffer.alloc(13);b.writeUInt32BE(width,0);b.writeUInt32BE(height,4);Buffer.from(tail).copy(b,8);return chunk('IHDR',b);}
function png(width,height,filtered,{tail,ancillary=[],compressed}={}){return Buffer.concat([signature,header(width,height,tail),...ancillary,chunk('IDAT',compressed??zlib.deflateSync(Buffer.from(filtered))),chunk('IEND')]);}
const decode=data=>api()({data,policy:POLICY});

test('gray PNG hand residuals cover filters0..4, modular wrap and row boundaries',()=>{
 const input=png(4,5,[0,5,250,10,240,1,251,10,245,20,2,5,251,6,246,3,17,242,140,234,4,246,37,234,18]);
 const r=decode(input);
 assert.deepEqual([...r.data],[5,250,10,240,251,5,250,14,0,0,0,4,17,250,9,240,7,31,243,5]);
 assert.deepEqual([r.width,r.height,r.stride],[4,5,4]);assert.equal(r.data.length,20);
});

test('gray PNG Paeth left/upperleft and up/upperleft ties preserve priority',()=>{
 assert.deepEqual([...decode(png(2,2,[0,2,3,4,254,29])).data],[2,3,0,29]);
 assert.deepEqual([...decode(png(2,2,[0,2,0,4,1,97])).data],[2,0,3,97]);
});

test('gray PNG unary pixel and column support without a neighbor or padding',()=>{
 const one=decode(png(1,1,[4,193]));assert.deepEqual([...one.data],[193]);assert.deepEqual([one.width,one.height,one.stride],[1,1,1]);
 assert.deepEqual([...decode(png(1,4,[0,255,2,1,3,1,4,254])).data],[255,0,1,255]);
});

test('gray PNG preserves eXIf/iTXt types but returns encoded pixels without orientation transform',()=>{
 // New synthetic TIFF orientation8; no actual user metadata is a fixture.
 const exif=Buffer.from('49492a0008000000010012010300010000000800000000000000','hex');
 const itxt=Buffer.from('example\0\0\0\0\0synthetic');
 const r=decode(png(3,2,[0,1,2,3,0,4,5,6],{ancillary:[chunk('eXIf',exif),chunk('iTXt',itxt)]}));
 assert.deepEqual([...r.data],[1,2,3,4,5,6]);assert.deepEqual([r.width,r.height],[3,2]);
 assert.deepEqual(r.metadata.chunkTypes,['IHDR','eXIf','iTXt','IDAT','IEND']);
 assert.deepEqual(r.metadata.ancillaryChunkTypes,['eXIf','iTXt']);
 assert.equal(r.metadata.orientation,null);assert.equal(r.metadata.orientationParsed,false);assert.equal(r.metadata.transformApplied,false);
});

test('gray PNG consecutive IDAT and nonzero BYTE views return private data',()=>{
 const compressed=zlib.deflateSync(Buffer.from([0,14,29,0,73,211])),split=Math.floor(compressed.length/2);
 const encoded=Buffer.concat([signature,header(2,2),chunk('IDAT',compressed.subarray(0,split)),chunk('IDAT'),chunk('IDAT',compressed.subarray(split)),chunk('IEND')]);
 const backing=new Uint8Array(encoded.length+17).fill(229);backing.set(encoded,5);const data=backing.subarray(5,5+encoded.length),before=backing.slice();
 const a=decode(data),b=decode(data);assert.deepEqual([...a.data],[14,29,73,211]);
 assert.notEqual(a.data.buffer,data.buffer);assert.notEqual(a.data.buffer,b.data.buffer);a.data[0]=0;
 assert.equal(b.data[0],14);assert.deepEqual(backing,before);
});

test('gray PNG requires explicit new policy, gray8/noninterlaced dimensions and allowed chunks',()=>{
 const run=api();assert.equal(typeof run,'function');
 const good=png(1,1,[0,19]);
 for(const r of [null,{data:good},{data:good,policy:'plain-gray8-noninterlaced'},{data:new Uint16Array(8),policy:POLICY}])assert.throws(()=>run(r));
 for(const [w,h,tail] of [[0,1],[4097,1],[4096,4096],[4000,4001],[1,1,[16,0,0,0,0]],[1,1,[8,2,0,0,0]],[1,1,[8,0,1,0,0]],[1,1,[8,0,0,1,0]],[1,1,[8,0,0,0,1]]])assert.throws(()=>decode(png(w,h,[0,19],{tail})));
 for(const kind of ['gAMA','iCCP','sRGB','cHRM','tRNS','pHYs','PLTE','ABCD'])assert.throws(()=>decode(png(1,1,[0,19],{ancillary:[chunk(kind,Buffer.from([0]))]})));
});

test('gray PNG chunk CRC, signature, extent, ordering, filter and exact EOF reject errors',()=>{
 assert.equal(typeof api(),'function');
 const good=png(1,1,[0,19]),badCRC=Buffer.from(good);badCRC[badCRC.length-1]^=1;
 const badMetadata=png(1,1,[0,19],{ancillary:[chunk('iTXt',Buffer.from('synthetic'))]});badMetadata[41]^=1;
 const comp=zlib.deflateSync(Buffer.from([0,19]));
 const cases=[badCRC,badMetadata,good.subarray(0,good.length-1),Buffer.concat([good,Buffer.of(0)]),Buffer.concat([Buffer.of(0),good.subarray(1)]),
  Buffer.concat([signature,header(1,1),header(1,1),chunk('IDAT',comp),chunk('IEND')]),
  Buffer.concat([signature,chunk('IDAT',comp),header(1,1),chunk('IEND')]),
  Buffer.concat([signature,header(1,1),chunk('IEND')]),good.subarray(0,good.length-12),
  Buffer.concat([signature,header(1,1),chunk('IDAT',comp.subarray(0,3)),chunk('iTXt'),chunk('IDAT',comp.subarray(3)),chunk('IEND')]),
  png(1,1,[5,19]),Buffer.concat([signature,header(1,1),chunk('IDAT',comp),chunk('IEND',Buffer.of(1))])];
 for(const b of cases)assert.throws(()=>decode(b));
});

test('gray PNG bounded inflate rejects wrong output size, incomplete stream and compressed trailing',()=>{
 assert.equal(typeof api(),'function');
 const raw=Buffer.from([0,19]),comp=zlib.deflateSync(raw);
 for(const compressed of [zlib.deflateSync(Buffer.of(0)),zlib.deflateSync(Buffer.of(0,19,20)),zlib.deflateSync(Buffer.alloc(1024)),
  comp.subarray(0,comp.length-1),Buffer.concat([comp,Buffer.of(0)]),Buffer.concat([comp,comp])])assert.throws(()=>decode(png(1,1,raw,{compressed})));
});
