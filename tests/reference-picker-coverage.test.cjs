'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const modulePath='../inference/skin-reference/picker-coverage.cjs';

// 填满padding后另写逻辑像素，能发现误把行尾计入覆盖率的实现。
function plane(w,h,stride){
 const data=new Uint8Array((h-1)*stride+w).fill(255);
 for(let y=0;y<h;y++)data.fill(0,y*stride,y*stride+w);
 return {data,width:w,height:h,stride};
}

test('picker coverage counts nonzero pixels and includes exactly thirty percent without padding',()=>{
 const {evaluateSuppliedPickerCoverage:run}=require(modulePath),mask=plane(10,10,13);
 for(let i=0;i<29;i++)mask.data[Math.trunc(i/10)*13+i%10]=1;
 const r={sourceWH:[20,20],point:[10,10],aggregateMask:mask};
 const a=run(r);assert.equal(a.eligible,false);assert.equal(a.count,29);assert.equal(a.area,100);
 mask.data[2*13+9]=2;const before=mask.data.slice(),b=run(r);
 assert.equal(b.eligible,true);assert.equal(b.count,30);assert.equal(b.coverage,.3);
 assert.deepEqual(Array.from(b.sourceROI),[0,0,20,20]);assert.deepEqual(Array.from(b.maskROI),[0,0,10,10]);assert.deepEqual(mask.data,before);
});

test('picker coverage maps source patch with floor and ceil and clips the bottom right patch',()=>{
 const {evaluateSuppliedPickerCoverage:run}=require(modulePath),mask=plane(8,10,11);
 // 128照片的[32,32,64,64]映射到8×10画布的[2,2,4,6]，共24像素。
 for(const [x,y]of [[2,2],[3,2],[4,2],[5,2],[2,3],[3,3],[4,3]])mask.data[y*11+x]=255;
 const r={sourceWH:[128,128],point:[64,64],aggregateMask:mask};
 assert.equal(run(r).eligible,false);mask.data[7*11+5]=1;
 const a=run(r);assert.equal(a.eligible,true);assert.equal(a.count,8);assert.equal(a.area,24);assert.deepEqual(Array.from(a.maskROI),[2,2,4,6]);
 const edge=plane(7,9,10);edge.data[6*10+4]=1;edge.data[7*10+5]=1;edge.data[8*10+6]=1;
 const b=run({sourceWH:[100,100],point:[99,99],aggregateMask:edge});
 assert.deepEqual(Array.from(b.sourceROI),[67,67,33,33]);assert.deepEqual(Array.from(b.maskROI),[4,6,3,3]);assert.equal(b.area,9);assert.equal(b.count,3);assert.equal(b.eligible,true);
});

test('picker readback only counts the first physical byte per pixel and preserves caller data',()=>{
 const {evaluateSuppliedPickerReadback:run}=require(modulePath),base=new Uint8Array(60).fill(255),data=base.subarray(6,49);
 for(let y=0;y<2;y++)for(let x=0;x<5;x++)data[y*23+x*4]=0;
 data[0]=1;data[4]=2;const frame={data,width:5,height:2,stride:23,channels:4};
 assert.equal(run(frame).eligible,false);data[23+16]=255;
 const before=base.slice(),r=run(frame);assert.deepEqual(r,{eligible:true,count:3,area:10,coverage:.3});assert.deepEqual(base,before);
 assert.deepEqual(run({data:Uint8Array.of(1,0,0,0),width:1,height:1,stride:4,channels:4}),{eligible:true,count:1,area:1,coverage:1});
});

test('picker coverage rejects invalid supplies and excludes zero source coordinates',()=>{
 const {evaluateSuppliedPickerCoverage:run,evaluateSuppliedPickerReadback:read}=require(modulePath),mask=plane(3,3,7);
 const r={sourceWH:[20,20],point:[1,1],aggregateMask:mask};
 for(const point of [[0,1],[1,0],[-1,4],[20,4],[4,20]]){
  const a=run({...r,point});assert.equal(a.eligible,false);assert.equal(a.sourceROI,null);assert.equal(a.maskROI,null);assert.equal(a.area,0);
 }
 assert.throws(()=>run({...r,aggregateMask:undefined}),TypeError);
 assert.throws(()=>run({...r,point:[1.5,1]}),TypeError);
 assert.throws(()=>run({...r,sourceWH:[32767,20]}),RangeError);
 assert.throws(()=>run({...r,aggregateMask:{...mask,data:new Float32Array(20)}}),TypeError);
 assert.throws(()=>run({...r,aggregateMask:{...mask,channels:4}}),TypeError);
 assert.throws(()=>run({...r,aggregateMask:{...mask,data:mask.data.subarray(0,16)}}),TypeError);
 assert.throws(()=>read({data:new Uint8Array(64),width:4,height:4,stride:16,channels:3}),TypeError);
 assert.throws(()=>read({data:new Uint8Array(260),width:65,height:1,stride:260,channels:4}),RangeError);
});

test('picker coverage rejects sparse source dimensions before producing a decision',()=>{
 const {evaluateSuppliedPickerCoverage:run}=require(modulePath),mask=plane(3,3,3);
 const sourceWH=new Array(2);sourceWH[1]=20;
 assert.throws(()=>run({sourceWH,point:[1,1],aggregateMask:mask}),RangeError);
 assert.throws(()=>run({sourceWH:new Array(2),point:[1,1],aggregateMask:mask}),RangeError);
});
