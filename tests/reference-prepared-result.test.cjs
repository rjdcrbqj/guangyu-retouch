'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let stage;try{stage=require('../inference/skin-reference/prepared-result.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function fixture(delta=26){
 const source=new Uint8Array(19*4).fill(171);for(let y=0;y<4;y++)for(let x=0;x<4;x++)source.set([128,128,128,211],y*19+x*4);
 const A=768*768,coefficients=new Float32Array(9*A),k=-(delta-.25)/128; // 留.25余量，BYTE截断后实际变暗delta。
 for(let ch=0;ch<3;ch++)coefficients.fill(k,(ch*3+ch)*A,(ch*3+ch+1)*A);
 return {source,width:4,height:4,stride:19,channels:4,geometry:{valid:true,originalROI:Int32Array.from([1,1,2,2]),postAffine:Float32Array.from([1,0,0,0,1,0])},
  heads:{coefficients,mask:new Float32Array(A).fill(1)},blendMask:new Uint8Array([255,255,93,255,255,93]),blendMaskStride:3,
  secondaryTestMask:new Uint8Array([1,255,77,128,1,77]),secondaryTestMaskStride:3,secondaryProtection:new Uint8Array([255,255,55,255,255,55]),secondaryProtectionStride:3,intensity:1};
}
test('结果先处理同一mask再触发.1削弱，最终mask副本保护源数据',()=>{
 assert.equal(typeof stage?.applyPreparedReferenceResult,'function','prepared result stage is missing');
 const r=fixture(),before=r.source.slice(),mask=r.blendMask.slice(),prot=r.secondaryProtection.slice();
 const out=stage.applyPreparedReferenceResult(r),expected=before.slice();
 for(let y=1;y<3;y++)for(let x=1;x<3;x++)expected.set([112,112,112],y*19+x*4);
 assert.deepEqual(out.output,expected);assert.deepEqual(out.secondary,{score:104000n,count:4n,trigger:true});assert.equal(out.changedRGBFields,12);
 assert.deepEqual(out.finalMask,new Uint8Array([229,229,93,229,229,93]));assert.deepEqual(r.blendMask,mask);assert.deepEqual(r.secondaryProtection,prot);assert.deepEqual(r.source,before);
 const tiny=fixture();tiny.blendMask.fill(1);const tinyOut=stage.applyPreparedReferenceResult(tiny);
 assert.equal(tinyOut.secondary.score,104000n);assert.equal(tinyOut.secondary.trigger,true);assert.deepEqual(tinyOut.output,tiny.source);
});
test('独立判定mask与严格25阈值、缺保护拒绝及无可选颜色映射范围',()=>{
 assert.equal(typeof stage?.applyPreparedReferenceResult,'function','prepared result stage is missing');
 const equal=fixture(25);delete equal.secondaryProtection;const out=stage.applyPreparedReferenceResult(equal);
 assert.deepEqual(out.secondary,{score:100000n,count:4n,trigger:false});assert.deepEqual(out.finalMask,equal.blendMask);
 const empty=fixture();empty.secondaryTestMask.fill(0);delete empty.secondaryProtection;assert.deepEqual(stage.applyPreparedReferenceResult(empty).secondary,{score:0n,count:0n,trigger:false});
 const r=fixture(),before=r.source.slice(),mask=r.blendMask.slice();
 for(const patch of [{secondaryProtection:undefined},{secondaryProtection:new Uint8Array(1)},{secondaryTestMask:new Uint8Array(1)},{geometry:{...r.geometry,valid:false}},{colorMapRequired:true},{startRow:1},{intensity:NaN}]){
  assert.throws(()=>stage.applyPreparedReferenceResult({...r,...patch}));assert.deepEqual(r.source,before);assert.deepEqual(r.blendMask,mask);
 }
});

test('触发保护同时以DOUBLE .65缩放F32强度，严格阈值未触发则不缩放',()=>{
 const triggered=fixture(),out=stage.applyPreparedReferenceResult(triggered);
 for(let y=1;y<3;y++)for(let x=1;x<3;x++)assert.deepEqual(Array.from(out.output.subarray(y*19+x*4,y*19+x*4+3)),[112,112,112]);
 assert.equal(out.appliedIntensity,Math.fround(.65));
 assert.equal(out.completionBoundary,'final-blend-segment');assert.equal(out.pendingSecondaryPostBlend,true);
 const equal=fixture(25),plain=stage.applyPreparedReferenceResult(equal);
 assert.equal(plain.appliedIntensity,1);assert.equal(plain.output[19+4],103);assert.equal(plain.pendingSecondaryPostBlend,false);
 assert.throws(()=>stage.applyPreparedReferenceResult({...triggered,intensity:'1'}));
 const fractional=stage.applyPreparedReferenceResult({...triggered,intensity:.03});
 const bits=new DataView(new ArrayBuffer(4));bits.setFloat32(0,fractional.appliedIntensity,true);assert.equal(bits.getUint32(0,true),0x3c9fbe77); // DOUBLE .65，不能先转F32常量。
});

test('已供应后回调在finalblend后执行，使用CV260与独立第二mask且只触发时应用',()=>{
 const r=fixture(),post={mask2:new Uint8Array([0,0,61,0,0,61]),mask2Stride:3,
  tableA:Uint8Array.from({length:256},(_,i)=>Math.min(255,i+10)),tableB:Uint8Array.from({length:256},(_,i)=>255-i),rounding:'nearest-even'};
 const before=r.source.slice(),mask1=r.secondaryProtection.slice(),mask2=post.mask2.slice(),out=stage.applyPreparedReferenceResult({...r,secondaryPostBlend:post});
 for(let y=1;y<3;y++)for(let x=1;x<3;x++)assert.deepEqual(Array.from(out.output.subarray(y*19+x*4,y*19+x*4+3)),[153,153,153]);
 assert.equal(out.pendingSecondaryPostBlend,false);assert.equal(out.secondaryPostBlendApplied,true);assert.equal(out.completionBoundary,'prepared-result-with-supplied-secondary-postblend');
 assert.deepEqual(r.source,before);assert.deepEqual(r.secondaryProtection,mask1);assert.deepEqual(post.mask2,mask2);
 const equal=fixture(25),plain=stage.applyPreparedReferenceResult({...equal,secondaryPostBlend:post});assert.equal(plain.output[19+4],103);assert.equal(plain.secondaryPostBlendApplied,false);
 for(const patch of [{mask2:new Uint8Array(1)},{tableA:new Uint8Array(1)},{rounding:undefined}]){
  assert.throws(()=>stage.applyPreparedReferenceResult({...r,secondaryPostBlend:{...post,...patch}}));assert.deepEqual(r.source,before);
 }
});

test('明确供应optional LUT在secondary判定之前应用，false分支不读取payload',()=>{
 const r=fixture(25),lut=new Uint8Array(64*64*3).fill(100),coordinates=Int32Array.from({length:256},(_,v)=>Math.floor(1920*v/255));
 const axis0=Int32Array.from({length:17},(_,i)=>Math.min(i,15)*3),axis1=Int32Array.from({length:17},(_,i)=>Math.min(i,15)*64*3),
  axis2=Int32Array.from({length:17},(_,i)=>{const j=Math.min(i,15);return Math.floor(j/4)*16*64*3+j%4*16*3;});
 const colorMap={lut,lutSize:64,lutFormat:301,lutStride:64*3,coordinates,axis0,axis1,axis2,rounding:'integer-sar7-sar14'};
 const before=r.source.slice(),mask=r.blendMask.slice(),lutBefore=lut.slice();
 const out=stage.applyPreparedReferenceResult({...r,colorMapRequired:true,colorMap});
 assert.deepEqual(out.secondary,{score:112000n,count:4n,trigger:true}); // M5变暗25不触发；LUT100后变暗28才触发。
 for(let y=1;y<3;y++)for(let x=1;x<3;x++)assert.deepEqual(Array.from(out.output.subarray(y*19+x*4,y*19+x*4+3)),[111,111,111]);
 assert.equal(out.colorMapApplied,true);assert.equal(out.pendingSecondaryPostBlend,true);
 assert.deepEqual(out.finalMask,new Uint8Array([229,229,93,229,229,93]));
 assert.deepEqual(r.source,before);assert.deepEqual(r.blendMask,mask);assert.deepEqual(lut,lutBefore);
 const ignored={...r,colorMapRequired:false};Object.defineProperty(ignored,'colorMap',{get(){throw Error('false branch read colorMap');}});
 const plain=stage.applyPreparedReferenceResult(ignored);assert.equal(plain.colorMapApplied,false);assert.equal(plain.secondary.trigger,false);assert.equal(plain.output[19+4],103);
 for(const patch of [{colorMap:undefined},{colorMap:null},{colorMap:{...colorMap,lutStride:193}},{colorMap:{...colorMap,coordinates:new Int32Array(256)}}]){
  assert.throws(()=>stage.applyPreparedReferenceResult({...r,colorMapRequired:true,...patch}));assert.deepEqual(r.source,before);
 }
});
