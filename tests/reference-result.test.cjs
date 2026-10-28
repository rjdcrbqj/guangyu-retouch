'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let result;try{result=require('../inference/skin-reference/result.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function fixture(){
 const source=new Uint8Array(19*4).fill(123);for(let y=0;y<4;y++)for(let x=0;x<4;x++)source.set([128,128,128,211],y*19+x*4);
 const coefficients=new Float32Array(9*768*768);coefficients.fill(.5,0,768*768);
 return {source,width:4,height:4,stride:19,channels:4,geometry:{valid:true,originalROI:Int32Array.from([1,1,2,2]),postAffine:Float32Array.from([1,0,0,0,1,0])},
  heads:{coefficients,mask:new Float32Array(768*768).fill(1)},pixelMask:new Uint8Array([255,0,255,255]),pixelMaskStride:2,finalMask:new Uint8Array([255,255,0,128]),finalMaskStride:2,intensity:.5};
}
test('supplied result applies separate row gate and final strength on original absolute ROI',()=>{
 assert.equal(typeof result?.applySuppliedReferenceResult,'function','reference result composition is missing');
 const args=fixture(),before=args.source.slice(),actual=result.applySuppliedReferenceResult(args);
 const expected=before.slice();expected[19+4]=160;expected[38+8]=144;
 assert.deepEqual(actual.output,expected);assert.deepEqual(actual.ROI,[1,1,2,2]);assert.equal(actual.changedRGBFields,2);
 assert.deepEqual(args.source,before);assert.equal(args.heads.coefficients[0],.5);assert.equal(args.heads.mask[0],1);
 actual.output[0]=0;assert.equal(args.source[0],128);
});
test('supplied result respects partial rows and rejects incomplete inputs atomically',()=>{
 assert.equal(typeof result?.applySuppliedReferenceResult,'function','reference result composition is missing');
 const args=fixture(),before=args.source.slice(),actual=result.applySuppliedReferenceResult({...args,startRow:1,endRow:2});
 const expected=before.slice();expected[38+8]=144;assert.deepEqual(actual.output,expected);assert.equal(actual.changedRGBFields,1);
 for(const patch of [{geometry:{...args.geometry,valid:false}},{geometry:{...args.geometry,originalROI:Int32Array.from([3,3,2,2])}},{heads:{...args.heads,mask:new Float32Array(1)}},{finalMask:new Uint8Array(1)},{intensity:NaN}]){
  assert.throws(()=>result.applySuppliedReferenceResult({...args,...patch}));assert.deepEqual(args.source,before);
 }
});

test('row gate copies source but supplied final mask still performs F32 self-blend',()=>{
 const args=fixture();for(let y=0;y<4;y++)for(let x=0;x<4;x++)args.source.set([29,29,29],y*19+x*4);
 args.pixelMask.fill(0);args.finalMask.fill(255);args.intensity=.35;
 const before=args.source.slice(),expected=before.slice();for(let y=1;y<3;y++)for(let x=1;x<3;x++)expected.set([28,28,28],y*19+x*4);
 const actual=result.applySuppliedReferenceResult(args);
 assert.deepEqual(actual.output,expected);assert.equal(actual.changedRGBFields,12);assert.deepEqual(args.source,before);
});
