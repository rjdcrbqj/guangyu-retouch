'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function api(){return require('../inference/skin-reference/mask64.cjs').prepareSuppliedReferenceMask64;}
test('mask64 两像素crop按mono code2定点先H后V,endpoint253',()=>{
 const run=api(),data=Uint8Array.from([0,64,211,128,255,212,199]);
 const before=data.slice(),r=run({mask:{data,width:2,height:2,stride:3},ratios:[0,0],currentPhotoWH:[2,2],math:'native-code2-scalar'});
 assert.equal(r.valid,true);assert.deepEqual(Array.from(r.ROI),[0,0,2,2]);
 assert.deepEqual([r.mask.width,r.mask.height,r.mask.stride,r.mask.data.length],[64,64,64,4096]);
 assert.deepEqual([r.mask.data[0],r.mask.data[63],r.mask.data[63*64],r.mask.data[4095]],[0,64,128,253]);
 assert.deepEqual(data,before);assert.notEqual(r.mask.data.buffer,data.buffer);
});
test('mask64 photo与mask独立尺寸→中部64crop完整copy,保留源padding',()=>{
 const run=api(),w=200,h=100,stride=207,data=new Uint8Array(stride*h+7).fill(229);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)data[y*stride+x]=(x*7+y*11)%256;
 const before=data.slice(),r=run({mask:{data,width:w,height:h,stride},ratios:[.5,.5],currentPhotoWH:[256,128],math:'native-code2-scalar'});
 assert.deepEqual(Array.from(r.ROI),[96,32,64,64]);assert.equal(r.valid,true);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(r.mask.data[y*64+x],((x+96)*7+(y+32)*11)%256);
 assert.deepEqual(data,before);r.mask.data.fill(0);assert.deepEqual(data,before);
});
test('mask64 clipped独立maskWH crop宽13高14,不是photo同框',()=>{
 const run=api(),data=new Uint8Array(60*58).fill(42);
 const r=run({mask:{data,width:60,height:58,stride:60},ratios:[.99,.95],currentPhotoWH:[80,80],math:'native-code2-scalar'});
 assert.deepEqual(Array.from(r.ROI),[47,44,13,14]);assert.ok(r.mask.data.every(v=>v===42));
});
test('mask64 一像素有效crop支持mono source1,最后row无尾padding',()=>{
 const run=api(),stride=72,data=new Uint8Array(68*stride+69).fill(0);data[68*stride+68]=73;
 const request={mask:{data,width:69,height:69,stride},ratios:[1,1],currentPhotoWH:[100,100],math:'native-code2-scalar'};
 const a=run(request),b=run(request);assert.deepEqual(Array.from(a.ROI),[68,68,1,1]);
 assert.ok(a.mask.data.every(v=>v===73));a.mask.data[0]=0;assert.equal(b.mask.data[0],73);assert.equal(data[68*stride+68],73);
});
test('mask64 空ROI不造零mask;无效供给/整数/比例/声明拒绝',()=>{
 const run=api(),data=new Uint8Array(4),mask={data,width:2,height:2,stride:2};
 const r={mask,ratios:[1,1],currentPhotoWH:[100,100],math:'native-code2-scalar'},empty=run(r);
 assert.equal(empty.valid,false);assert.equal(empty.mask,null);assert.deepEqual(Array.from(empty.ROI),[2,2,0,0]);
 for(const change of [{math:'cv-linear'},{mask:{...mask,stride:1}},{mask:{...mask,data:new Float32Array(4)}},{mask:{...mask,width:32767}},
  {ratios:[NaN,1]},{currentPhotoWH:[1,2]},{mask:{...mask,data:new Uint8Array(3)}}])assert.throws(()=>run({...r,...change}));
 assert.deepEqual(data,new Uint8Array(4));
});

test('mask64 新whole1:完整mask可为单行/列/像素,不是只支持crop1',()=>{
 const run=api();
 const one=run({mask:{data:Uint8Array.of(37),width:1,height:1,stride:1},ratios:[0,0],currentPhotoWH:[64,64],math:'native-code2-scalar'});
 assert.deepEqual(Array.from(one.ROI),[0,0,1,1]);assert.ok(one.mask.data.every(v=>v===37));
 const col=Uint8Array.from([30,211,31,212,32,213,33,214,34]);
 const vertical=run({mask:{data:col,width:1,height:5,stride:2},ratios:[0,0],currentPhotoWH:[64,64],math:'native-code2-scalar'});
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(vertical.mask.data[y*64+x],30+Math.floor((y+.5)*5/64));
 const horizontal=run({mask:{data:Uint8Array.from([30,31,32,33,34]),width:5,height:1,stride:5},ratios:[0,0],currentPhotoWH:[64,64],math:'native-code2-scalar'});
 assert.equal(horizontal.mask.data[0],30);assert.equal(horizontal.mask.data[63],34);assert.deepEqual(horizontal.mask.data.slice(0,64),horizontal.mask.data.slice(63*64));
 assert.deepEqual(Array.from(col),[30,211,31,212,32,213,33,214,34]);
});
