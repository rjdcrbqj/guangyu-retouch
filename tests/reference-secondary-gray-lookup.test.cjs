'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const MATH='native-cvt6-u8-generic-then-lut0';
function api(){return require('../inference/skin-reference/secondary-gray-lookup.cjs').prepareSuppliedSecondaryLookupGray;}
test('secondary code6 uses literal physical012 weights before BYTE lookup and preserves alpha/padding/SAB source',()=>{
 const run=api(),width=16,height=12,stride=69,all=new Uint8Array(new SharedArrayBuffer(7+stride*height+9)).fill(71),data=all.subarray(7,7+stride*height);
 const colors=[[255,0,0,17],[0,255,0,39],[0,0,255,201],[63,63,63,5],[1,1,1,255],[0,0,0,83],[255,255,255,13],[37,91,203,169]];
 const literal=[226,105,179,192,254,255,0,137]; // gray29,150,76,63,1,0,255,118; table255-gray.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(colors[(x+y)%8],y*stride+x*4);
 const table=new Uint8Array(new SharedArrayBuffer(256));for(let i=0;i<256;i++)table[i]=255-i;
 const before=all.slice(),result=run({photo:{data,width,height,stride,channels:4},table,math:MATH});
 assert.equal(result.available,true);const gray=result.lookupGray;assert.deepEqual([gray.width,gray.height,gray.stride],[16,12,16]);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)assert.equal(gray.data[y*16+x],literal[(x+y)%8]);
 assert.deepEqual(all,before);assert.equal(gray.data.buffer instanceof SharedArrayBuffer,false);
 data.fill(0);table.fill(0);assert.equal(gray.data[0],226);assert.equal(gray.data[7],137);
});
test('secondary gray lookup lacks no default table and gates missing supply before reading photo',()=>{
 const run=api();for(const table of [null,undefined]){
  const r={table,math:MATH};Object.defineProperty(r,'photo',{get(){throw Error('missing table must not read photo');}});
  assert.deepEqual(run(r),{available:false,lookupGray:null});
 }
});
test('secondary gray lookup accepts cn3 minimal last row span and rejects unsupported supplied layouts',()=>{
 const run=api(),data=Uint8Array.from([255,0,0,255,255,255,91,92,0,0,255,0,255,0]),photo={data,width:2,height:2,stride:8,channels:3},table=Uint8Array.from({length:256},(_,i)=>i);
 const result=run({photo,table,math:MATH});assert.deepEqual(Array.from(result.lookupGray.data),[29,255,76,150]);
 for(const patch of [{width:0},{width:513},{height:NaN},{channels:1},{channels:5},{stride:5},{data:data.subarray(0,13)}])assert.throws(()=>run({photo:{...photo,...patch},table,math:MATH}));
 for(const wrong of [new Uint8Array(255),new Float32Array(256),[]])assert.throws(()=>run({photo,table:wrong,math:MATH}));
 assert.throws(()=>run({photo,table}));
});
