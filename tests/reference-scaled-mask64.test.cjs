'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function api(){return require('../inference/skin-reference/scaled-mask64.cjs').prepareScaledSuppliedReferenceMask64;}
function request(mask,sourcePhotoWH,ratios=[0,0]){
 return {mask,sourcePhotoWH,ratios,rounding:'nearest-even',math:'native-code1-then-code2-scalar'};
}
test('scaled-mask64 奇数半缩全盒half-up/边缘nearest-even后再mono64',()=>{
 const source=Uint8Array.from([1,1,0,0,0,1,0,1,9]),before=source.slice();
 const r=api()(request({data:source,width:3,height:3,stride:3},[512,400]));
 assert.equal(r.scale,.5);assert.deepEqual(Array.from(r.scaledWH),[2,2]);
 assert.equal(r.valid,true);assert.deepEqual(Array.from(r.ROI),[0,0,2,2]);
 assert.deepEqual([r.mask.data[0],r.mask.data[63],r.mask.data[4032],r.mask.data[4095]],[1,0,0,9]);
 assert.deepEqual(source,before);r.mask.data.fill(245);assert.deepEqual(source,before);
});
test('scaled-mask64 whole1保留真实scale,支持INT32照片尺寸并复制数据',()=>{
 const source=Uint8Array.of(83),photo=Int32Array.of(1025,700);
 const r=api()(request({data:source,width:1,height:1,stride:1},photo));
 assert.equal(r.scale,Math.fround(1025/1024));assert.deepEqual(Array.from(r.scaledWH),[1,1]);
 assert.deepEqual(Array.from(r.ROI),[0,0,1,1]);assert.ok(r.mask.data.every(v=>v===83));
 photo[0]=2;source[0]=0;assert.equal(r.mask.data[0],83);assert.deepEqual(Array.from(r.scaledWH),[1,1]);
});
test('scaled-mask64 独立源mask先倍增再按照片坐标裁64,末行无需padding',()=>{
 const width=32,height=40,stride=35,data=new Uint8Array((height-1)*stride+width).fill(231);
 for(let y=0;y<height;y++)data.fill(57,y*stride,y*stride+width);
 const before=data.slice(),r=api()(request({data,width,height,stride},[2048,1024]));
 assert.equal(r.scale,2);assert.deepEqual(Array.from(r.scaledWH),[64,80]);
 assert.deepEqual(Array.from(r.ROI),[0,0,64,64]);assert.ok(r.mask.data.every(v=>v===57));
 assert.deepEqual(data,before);
});
test('scaled-mask64 512mask倍增仍不足照片比例坐标时保留空ROI',()=>{
 const r=api()(request({data:new Uint8Array(512*512).fill(71),width:512,height:512,stride:512},[2048,2048],[.75,.75]));
 assert.equal(r.valid,false);assert.equal(r.mask,null);assert.equal(r.scale,2);
 assert.deepEqual(Array.from(r.scaledWH),[1024,1024]);assert.deepEqual(Array.from(r.ROI),[1024,1024,0,0]);
});
test('scaled-mask64 独立sourcePhotoWH决定scale,非mask自身长边',()=>{
 const r=api()(request({data:new Uint8Array(7*4).fill(103),width:7,height:4,stride:7},[1400,800]));
 assert.equal(r.scale,1.3671875);assert.deepEqual(Array.from(r.scaledWH),[10,5]);
 assert.deepEqual(Array.from(r.ROI),[0,0,10,5]);assert.ok(r.mask.data.every(v=>v===103));
});
test('scaled-mask64 供给/舍入/数学声明与无效sourceWHO拒绝',()=>{
 const run=api(),r=request({data:Uint8Array.of(7,8,9,10),width:2,height:2,stride:2},[1024,700]);
 for(const change of [{math:'native-code2-scalar'},{rounding:'half-up'},{sourcePhotoWH:[1,1024]},
  {sourcePhotoWH:[100,100]},{ratios:[NaN,0]},{mask:{...r.mask,stride:1}},{mask:null}])assert.throws(()=>run({...r,...change}));
 assert.throws(()=>run(null));assert.deepEqual(Array.from(r.mask.data),[7,8,9,10]);
});
