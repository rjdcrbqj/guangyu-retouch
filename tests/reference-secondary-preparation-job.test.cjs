'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
function shared(Type,n){return new Type(new SharedArrayBuffer(n*Type.BYTES_PER_ELEMENT));}
test('new secondary preparation supply survives async processor snapshot and feeds both final masks',async()=>{
 const A=768*768,coefficients=new Float32Array(9*A),k=-29.75/128;
 for(let c=0;c<3;c++)coefficients.fill(k,(c*3+c)*A,(c*3+c+1)*A);
 const heads={coefficients,mask:new Float32Array(A).fill(1)};
 let release,calls=0,closes=0;const waiting=new Promise(resolve=>{release=resolve;});
 const processor=new SkinReferenceProcessor({models:{run(){calls++;return waiting;},async close(){closes++;}}});
 const source=new Uint8Array(75*18).fill(77);
 for(let y=0;y<18;y++)for(let x=0;x<18;x++)source.set([128,128,128,209],y*75+x*4);
 const before=source.slice(),lookupGray=shared(Uint8Array,256),inputMask=shared(Uint8Array,256).fill(64),histogram=shared(Float32Array,256);
 for(let y=0;y<16;y++)lookupGray.fill(y<4?230:y>=12?20:120,y*16,(y+1)*16);
 histogram[20]=64;histogram[120]=128;histogram[230]=64;
 const tableA=shared(Uint8Array,256).fill(200),tableB=shared(Uint8Array,256).fill(150);
 const secondaryPreparation={width:16,height:16,lookupGray,inputMask,histogram,highFraction:.25,lowFraction:.25,math:'native-byte1-packed-no-tail-histogram-supplied',tableA,tableB,rounding:'nearest-even'};
 const request={original:{data:source,width:18,height:18,stride:75,channels:4},
  workingPhoto:{data:new Uint8Array(18*18*3).fill(128),width:18,height:18,stride:54,format:301},
  temporaryMask:{data:new Uint8Array(18*18).fill(255),width:18,height:18,stride:18},
  geometry:{valid:true,originalROI:Int32Array.from([1,1,16,16]),inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0])},
  referencePhoto:{data:new Uint8Array(64*64*3).fill(84),width:64,height:64,stride:192,format:301},
  referenceMask:{data:new Uint8Array(64*64).fill(63),width:64,height:64,stride:64},
  blendMask:new Uint8Array(256).fill(255),blendMaskStride:16,secondaryTestMask:new Uint8Array(256).fill(1),secondaryTestMaskStride:16,
  secondaryPreparation,intensity:1,referenceRevision:98};
 const job=processor.run(request);assert.equal(calls,1);
 for(const p of [lookupGray,inputMask,histogram,tableA,tableB])p.fill(0);
 release(heads);
 try{
  const result=await job;assert.equal(result.referenceRevision,98);assert.equal(result.secondary.trigger,true);
  assert.deepEqual(result.secondary,{score:7680000n,count:256n,trigger:true});
  assert.equal(result.secondaryProtectionPrepared,true);assert.equal(result.secondaryPostBlendApplied,true);assert.equal(result.pendingSecondaryPostBlend,false);
  // Source128→processed98; high64 suppresses blendMask255→248, producing109 then postblend132.
  // Unprotected middle truncates108; low64 keeps blendMask255, then tableB150 blends to119.
  for(const [y,want] of [[0,132],[7,108],[15,119]]){
   const p=(y+1)*75+5*4;assert.deepEqual(Array.from(result.output.subarray(p,p+4)),[want,want,want,209]);
  }
  assert.deepEqual([result.finalMask[0],result.finalMask[7*16],result.finalMask[15*16]],[248,255,255]);
  assert.deepEqual(result.output.subarray(0,75),before.subarray(0,75));
  for(let y=0;y<18;y++)assert.deepEqual(result.output.subarray(y*75+72,y*75+75),before.subarray(y*75+72,y*75+75));
  assert.deepEqual(source,before);assert.equal(request.blendMask.every(v=>v===255),true);
 }finally{await processor.close();}
 assert.equal(closes,1);
});
