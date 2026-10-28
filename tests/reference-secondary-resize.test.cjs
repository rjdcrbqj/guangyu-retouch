'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const math='native-code1-scalar-secondary512',rounding='nearest-even';
function api(){return require('../inference/skin-reference/secondary-resize.cjs').resizeSuppliedSecondaryMaskFrom512;}
test('secondary512 identity copies only active pixels from offset SAB and minimal last row',()=>{
 const run=api(),stride=515,span=511*stride+512,all=new Uint8Array(new SharedArrayBuffer(span+19)).fill(93),data=all.subarray(7,7+span);
 for(let y=0;y<512;y++)for(let x=0;x<512;x++)data[y*stride+x]=(x*3+y*5)%256;
 const before=all.slice(),v=run({data,stride,destinationWH:[512,512],rounding,math});
 assert.deepEqual([v.width,v.height,v.stride],[512,512,512]);
 for(let y=0;y<512;y++)assert.deepEqual(v.data.subarray(y*512,(y+1)*512),data.subarray(y*stride,y*stride+512));
 assert.deepEqual(all,before);assert.equal(v.data.buffer instanceof SharedArrayBuffer,false);data.fill(0);assert.equal(v.data[1],3);assert.equal(v.data[512],5);
});
test('secondary512 exact two-axis half uses four-point integer averaging including ties',()=>{
 const run=api(),data=new Uint8Array(512*512),top=[1,1,0,0,9,9,255,255],bottom=[0,0,1,0,0,0,255,255],literal=[1,0,5,255];
 for(let y=0;y<512;y++)for(let x=0;x<512;x++)data[y*512+x]=(y%2?bottom:top)[x%8];
 const v=run({data,stride:512,destinationWH:[256,256],rounding,math});
 for(let y=0;y<256;y++)for(let x=0;x<256;x++)assert.equal(v.data[y*256+x],literal[x%4]);
});
test('secondary512 rectangular code1 preserves nonbinary vertical coefficients and rejects malformed dimensions',()=>{
 const run=api(),data=new Uint8Array(512*512).fill(17);
 // First destination column samples x63/64; y84/85,255/256,426/427 have fractions5/6,1/2,1/6 after F32.
 for(const y of [84,255,426]){data[y*512+63]=0;data[y*512+64]=40;data[(y+1)*512+63]=80;data[(y+1)*512+64]=120;}
 const v=run({data,stride:512,destinationWH:[4,3],rounding,math});
 assert.deepEqual(Array.from(v.data),[87,17,17,17,60,17,17,17,33,17,17,17]);
 assert.deepEqual(Array.from(run({data,stride:512,destinationWH:[1,1],rounding,math}).data),[17]);
 for(const destinationWH of [[0,3],[3,4097],[1.5,3],[4],null])assert.throws(()=>run({data,stride:512,destinationWH,rounding,math}));
 for(const patch of [{stride:511},{data:data.subarray(0,data.length-1)},{math:undefined},{rounding:undefined}])assert.throws(()=>run({data,stride:512,destinationWH:[4,3],rounding,math,...patch}));
});
