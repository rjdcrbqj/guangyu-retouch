'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const MATH='native-byte1-packed-no-tail-histogram-supplied';
function api(){return require('../inference/skin-reference/secondary-protection.cjs').prepareSuppliedSecondaryProtectionMasks;}
function request(){
 const width=64,height=64,lookupGray=new Uint8Array(4096),inputMask=new Uint8Array(4096),histogram=new Float32Array(256);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){
  const i=y*64+x;lookupGray[i]=y<16?220:y<48?128:30;inputMask[i]=y<16?255:y<48?100:y===63?200:64;
 }
 histogram[30]=1024;histogram[128]=2048;histogram[220]=1024;
 return {width,height,lookupGray,inputMask,histogram,highFraction:.25,lowFraction:.25,math:MATH};
}
test('secondary protection composes strict tails, strong-mask subtraction, radius30 clipping and final multiplication',()=>{
 const run=api(),r=request(),before=[r.lookupGray.slice(),r.inputMask.slice(),r.histogram.slice()],v=run(r);
 assert.equal(v.available,true);assert.deepEqual(v.cutoffs,{high:220,low:30});assert.equal(v.effectiveRadius,15);assert.equal(v.auxiliary,null);
 assert.deepEqual([v.high.width,v.high.height,v.high.stride],[64,64,64]);
 // Horizontal bands leave the horizontal pass unchanged. Vertical denominator16²=256.
 // high boundary: floor(255*136/256)=135, next row floor(255*120/256)=119, then round(119*100/255)=47.
 assert.deepEqual([0,15,16,31].map(y=>v.high.data[y*64+20]),[255,135,47,0]);
 // Derived low excludes the last strong-mask row BEFORE blur; replicate repeats that zero.
 assert.deepEqual([47,48,62,63].map(y=>v.derivedLow.data[y*64+20]),[47,34,34,93]);
 assert.deepEqual(r.lookupGray,before[0]);assert.deepEqual(r.inputMask,before[1]);assert.deepEqual(r.histogram,before[2]);
 assert.notEqual(v.high.data,v.derivedLow.data);v.high.data[0]=0;assert.equal(r.inputMask[0],255);
});
test('secondary protection uses full working area for sparse histograms and retains fallback255/0',()=>{
 const run=api(),r=request();r.histogram.fill(0);r.histogram[200]=1;r.lookupGray.fill(200);r.inputMask.fill(0);r.inputMask[2048]=64;r.highFraction=.04;r.lowFraction=.03;
 const v=run(r);assert.equal(v.available,true);assert.deepEqual(v.cutoffs,{high:255,low:0});
 assert.equal(v.highTarget,Math.fround(4096*Math.fround(.04)));assert.equal(v.lowTarget,Math.fround(4096*Math.fround(.03)));
 assert.equal(v.high.data.some(Boolean),false);assert.equal(v.derivedLow.data.some(Boolean),false);
});
test('secondary protection leaves extreme threshold fill unavailable before reading image payloads',()=>{
 const run=api();for(const bin of [0,255]){
  const r=request();r.histogram.fill(0);r.histogram[bin]=4096;
  Object.defineProperty(r,'lookupGray',{get(){throw Error('must not read gray');}});Object.defineProperty(r,'inputMask',{get(){throw Error('must not read mask');}});
  const v=run(r);assert.equal(v.available,false);assert.equal(v.reason,'unresolved-threshold-fill');assert.equal(v.high,null);assert.equal(v.derivedLow,null);
 }
});
test('secondary protection refuses invalid counts, fractions, unsupported tails and nonpacked payload sizes',()=>{
 const run=api();
 for(const value of [-1,NaN,Infinity,.5,4097]){const r=request();r.histogram[4]=value;assert.throws(()=>run(r));}
 const overflow=request();overflow.histogram[0]=1;assert.throws(()=>run(overflow));
 for(const value of [-.01,1.01,NaN,Infinity,undefined]){const r=request();r.highFraction=value;assert.throws(()=>run(r));}
 for(const patch of [{width:63,height:63},{width:513},{histogram:new Float64Array(256)},{histogram:new Float32Array(255)},{lookupGray:new Uint8Array(4095)},{inputMask:new Uint8Array(4097)},{math:undefined}])assert.throws(()=>run({...request(),...patch}));
});
test('secondary protection rejects whole-area alignment that can leave a tail in scheduler row chunks',()=>{
 const run=api(),width=255,height=400,area=width*height,lookupGray=new Uint8Array(area),inputMask=new Uint8Array(area).fill(64),histogram=new Float32Array(256);
 lookupGray.fill(220,0,area/2);lookupGray.fill(30,area/2);histogram[220]=histogram[30]=area/2;
 // Entire plane divisible16; a 200-row callback would have51000 pixels and an8-byte tail.
 assert.equal(area%16,0);assert.equal(width*200%16,8);
 assert.throws(()=>run({width,height,lookupGray,inputMask,histogram,highFraction:.25,lowFraction:.25,math:MATH}),/无尾|16/);
});
