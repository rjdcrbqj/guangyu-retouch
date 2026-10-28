'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
const shared=(Type,n)=>new Type(new SharedArrayBuffer(n*Type.BYTES_PER_ELEMENT));
test('processor source512 path restores a24x16 ROI and snapshots source photo, counters and all three tables',async()=>{
 const A=768*768,coefficients=new Float32Array(9*A);
 for(let c=0;c<3;c++)coefficients.fill(-34.75/128,(c*3+c)*A,(c*3+c+1)*A);
 let release,calls=0,closes=0;const waiting=new Promise(resolve=>{release=resolve;});
 const processor=new SkinReferenceProcessor({models:{run(){calls++;return waiting;},async close(){closes++;}}});
 const source=new Uint8Array(131*24).fill(79);for(let y=0;y<24;y++)for(let x=0;x<32;x++)source.set([128,128,128,211],y*131+x*4);
 const before=source.slice(),sourceData=shared(Uint8Array,1197).fill(92),maskData=shared(Uint8Array,414).fill(85);
 for(let y=0;y<16;y++){sourceData.fill(128,y*75,y*75+72);maskData.fill(64,y*26,y*26+24);}
 const initialCounters=shared(Int32Array,256),grayTable=shared(Uint8Array,256),tableA=shared(Uint8Array,256).fill(200),tableB=shared(Uint8Array,256).fill(150);
 for(let i=0;i<256;i++)grayTable[i]=i;
 const secondaryPreparation={sourcePhoto:{data:sourceData,width:24,height:16,stride:75,channels:3},sourceMask:{data:maskData,width:24,height:16,stride:26,channels:1},initialCounters,grayTable,tableA,tableB,
  histogramMaskThreshold:0,highFraction:.04,lowFraction:.03,rounding:'nearest-even',math:'native-byte3-byte1-code1-secondary512-supplied'};
 const blendMask=new Uint8Array(384).fill(255);
 const job=processor.run({original:{data:source,width:32,height:24,stride:131,channels:4},workingPhoto:{data:new Uint8Array(32*24*3).fill(128),width:32,height:24,stride:96,format:301},
  temporaryMask:{data:new Uint8Array(32*24).fill(255),width:32,height:24,stride:32},
  geometry:{valid:true,originalROI:Int32Array.from([3,4,24,16]),inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0])},
  referencePhoto:{data:new Uint8Array(64*64*3).fill(96),width:64,height:64,stride:192,format:301},referenceMask:{data:new Uint8Array(64*64).fill(72),width:64,height:64,stride:64},
  blendMask,blendMaskStride:24,secondaryTestMask:new Uint8Array(384).fill(1),secondaryTestMaskStride:24,secondaryPreparation,intensity:1,referenceRevision:120});
 assert.equal(calls,1);for(const v of [sourceData,maskData,initialCounters,grayTable,tableA,tableB])v.fill(9);
 release({coefficients,mask:new Float32Array(A).fill(1)});
 try{
  const v=await job;assert.deepEqual(v.secondary,{score:13440000n,count:384n,trigger:true});
  assert.equal(v.secondaryProtectionPrepared,true);assert.equal(v.secondaryPostBlendApplied,true);assert.equal(v.pendingSecondaryPostBlend,false);assert.equal(v.referenceRevision,120);
  const expected=before.slice();for(let y=4;y<20;y++)for(let x=3;x<27;x++)expected.set([140,140,140],y*131+x*4);
  assert.deepEqual(v.output,expected);assert.equal(v.finalMask.every(x=>x===248),true);assert.deepEqual(source,before);assert.equal(blendMask.every(x=>x===255),true);
 }finally{await processor.close();}
 assert.equal(closes,1);
});
