'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let geometry;try{geometry=require('../inference/skin-reference/geometry.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('axis scale uses integer half-centres and row-major descriptor order',()=>{
 assert.equal(typeof geometry?.referenceAffine,'function','reference geometry is missing');
 assert.deepEqual(Array.from(geometry.referenceAffine({ROI:[10,20,128,64]})),[6,0,-60,0,6,72]);
 const odd=geometry.referenceAffine({ROI:[1,2,5,3],modelWH:[7,5]});
 assert.deepEqual(Array.from(new Uint32Array(odd.buffer)),[0x3fb33333,0,0xbf999998,0,0x3fb33333,0xc00ccccc]);
 assert.deepEqual(Array.from(geometry.referenceAffine({ROI:[0,0,768,768]})),[1,0,0,0,1,0]);
 assert.throws(()=>geometry.referenceAffine({ROI:[0,0,0,0]}));assert.throws(()=>geometry.referenceAffine({ROI:[0,0,1.5,3]}));
});

test('ROI keeps original asymmetric clamp and expands before clipping endpoints',()=>{
 assert.equal(typeof geometry?.expandReferenceBounds,'function','reference geometry is missing');
 const standard=geometry.expandReferenceBounds({bounds:[.2,.1,.6,.7],fullWH:[100,80]});
 assert.deepEqual(Array.from(standard.ROI),[7,14,67,36]);assert.equal(standard.valid,true);
 const asymmetric=geometry.expandReferenceBounds({bounds:[.9,.1,1,.9],fullWH:[20,100],padding:0});
 assert.deepEqual(Array.from(asymmetric.ROI),[2,19,16,80]);assert.equal(asymmetric.valid,true);
 const invalid=geometry.expandReferenceBounds({bounds:[1,1,0,0],fullWH:[100,80]});assert.equal(invalid.valid,false);
 assert.throws(()=>geometry.expandReferenceBounds({bounds:[NaN,0,1,1],fullWH:[100,80]}));
 assert.throws(()=>geometry.expandReferenceBounds({bounds:[0,0,1,1],fullWH:[100.5,80]}));
 const clipped=geometry.expandReferenceBounds({bounds:[0,0,1,1],fullWH:[100,80]});
 assert.deepEqual(Array.from(clipped.ROI),[0,0,99,79]);
});

test('bounds require both masks, strict selection threshold, and independent row strides',()=>{
 const width=16,height=16,baseStride=20,selectionStride=18;
 const baseMask=new Uint8Array(baseStride*height),selectionMask=new Uint8Array(selectionStride*height);
 for(const [x,y] of [[3,4],[10,12]]){baseMask[y*baseStride+x]=1;selectionMask[y*selectionStride+x]=21;}
 baseMask[0]=255;selectionMask[0]=20;
 selectionMask[15*selectionStride+15]=255;
 baseMask[15*baseStride]=255;
 for(let y=0;y<height;y++){baseMask.fill(255,y*baseStride+width,(y+1)*baseStride);selectionMask.fill(255,y*selectionStride+width,(y+1)*selectionStride);}
 const args={baseMask,selectionMask,width,height,baseStride,selectionStride};
 assert.deepEqual(Array.from(geometry.scanNormalizedBounds(args)),[3/16,2/16,13/16,11/16]);
 baseMask.fill(0);selectionMask.fill(0);
 assert.deepEqual(Array.from(geometry.scanNormalizedBounds(args)),[15/16,15/16,1/16,1/16]);
 baseMask[0]=1;selectionMask[0]=21;
 assert.deepEqual(Array.from(geometry.scanNormalizedBounds(args)),[-1/16,-1/16,1/16,1/16]);
 assert.throws(()=>geometry.scanNormalizedBounds({...args,baseStride:15}));
 assert.throws(()=>geometry.scanNormalizedBounds({...args,selectionMask:selectionMask.subarray(1)}));
});

test('resized sampling and original output retain distinct coordinate systems and invalidity',()=>{
 const args={normBounds:[.25,.25,.75,.75],originalWH:[128,128],workingWH:[256,256],padding:0};
 const resized=geometry.prepareReferenceGeometry({...args,resizeWorking:true});
 assert.equal(resized.valid,true);
 assert.deepEqual(Array.from(resized.originalROI),[32,32,64,64]);
 assert.deepEqual(Array.from(resized.workingROI),[64,64,128,128]);
 assert.deepEqual(Array.from(resized.postAffine),[12,0,-384,0,12,-384]);
 assert.deepEqual(Array.from(resized.inputForward),[6,0,-384,0,6,-384]);
 const unchanged=geometry.prepareReferenceGeometry(args);
 assert.deepEqual(Array.from(unchanged.workingROI),[32,32,64,64]);
 assert.deepEqual(Array.from(unchanged.inputForward),[12,0,-384,0,12,-384]);
 assert.notEqual(unchanged.originalROI,unchanged.workingROI);
 assert.notEqual(unchanged.inputForward,unchanged.postAffine);
 const small=geometry.prepareReferenceGeometry({...args,workingWH:[2,2],resizeWorking:true});
 assert.equal(small.valid,false);assert.equal(small.inputForward,null);assert.equal(small.postAffine,null);
 const missing=geometry.prepareReferenceGeometry({...args,normBounds:[15/16,15/16,1/16,1/16]});
 assert.equal(missing.valid,false);assert.equal(missing.inputForward,null);assert.equal(missing.postAffine,null);
 assert.throws(()=>geometry.prepareReferenceGeometry({...args,resizeWorking:1}));
});
