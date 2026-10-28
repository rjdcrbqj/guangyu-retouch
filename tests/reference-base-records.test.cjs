'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function api(){return require('../inference/skin-reference/base-records.cjs').combineSuppliedReferenceBaseRecords;}
const policy={math:'native-byte1-affine-add-generic',rounding:'nearest-even'};
function record(data,width,height,origin=[0,0],fullWH=[4,3],stride=width){return {fullWH,origin,image:{data:Uint8Array.from(data),width,height,stride}};}
test('base各记录先投影再饱和累加，重叠不是max或位OR',()=>{
 const records=[record([100,126,1,10],2,2),record([43,200,100,250],2,2,[1,0]),record([10],1,1,[2,1])];
 const before=records.map(r=>r.image.data.slice()),out=api()({records,...policy});
 assert.deepEqual([out.width,out.height,out.stride],[4,3,4]);
 assert.deepEqual(Array.from(out.data),[100,169,200,0,1,110,255,0,0,0,0,0]);
 out.data.fill(0);records.forEach((r,i)=>assert.deepEqual(r.image.data,before[i]));
});
test('DOUBLE平移先向零取整，负原点按warp裁出画布而不是selection ROI报错',()=>{
 const r=record([11,17,23,201,31,37,41],3,2,[-1.8,1.9],[4,3],4),before=r.image.data.slice();
 const out=api()({records:[r],...policy});
 assert.deepEqual(Array.from(out.data),[0,0,0,0,17,23,0,0,37,41,0,0]);assert.deepEqual(r.image.data,before);
 const one=api()({records:[record([191],1,1,[1.99,-.99])],...policy});
 assert.deepEqual(Array.from(one.data),[0,191,0,0,0,0,0,0,0,0,0,0]);
});
test('fullWH两正轴按原顺序选定，不用局部尺寸或后续更大WHO替换',()=>{
 const metadata=[{fullWH:[4,0],image:null},{fullWH:[0,3],image:null}];
 const out=api()({records:[...metadata,record([71,73],2,1,[1,1])],...policy});
 assert.deepEqual([out.width,out.height],[4,3]);assert.deepEqual(Array.from(out.data),[0,0,0,0,0,71,73,0,0,0,0,0]);
 assert.throws(()=>api()({records:[...metadata,record([1],1,1,[0,0],[8,8])],...policy}),/fullWH/);
});
test('非零view和独立stride只读有效列，单像素完整图也可组合',()=>{
 const bytes=Uint8Array.from([201,3,7,202,11,13,203]),r=record([],2,2,[2,1]);
 r.image={data:bytes.subarray(1,6),width:2,height:2,stride:3};
 const out=api()({records:[r],...policy});assert.deepEqual(Array.from(out.data),[0,0,0,0,0,0,3,7,0,0,11,13]);
 const one=api()({records:[record([177],1,1,[0,0],[1,1]),record([91],1,1,[0,0],[1,1])],...policy});
 assert.deepEqual(Array.from(one.data),[255]);assert.deepEqual(Array.from(bytes),[201,3,7,202,11,13,203]);
});
test('无记录/无有效图明确不可用，真实图完全在画布外则仍是有效零投影',()=>{
 const run=api();assert.equal(run({records:[],...policy}),null);
 assert.equal(run({records:[{fullWH:[4,3],image:null}],...policy}),null);
 assert.equal(run({records:[{fullWH:[0,0],image:null}],...policy}),null);
 const out=run({records:[record([51,53],2,1,[8,9])],...policy});assert.deepEqual(Array.from(out.data),new Array(12).fill(0));
});
test('不支持的format/stride/尺寸/数学和舍入拒绝',()=>{
 const run=api(),r=record([1,2,3,4],2,2);
 for(const image of [{...r.image,data:new Float32Array(4)},{...r.image,channels:3},{...r.image,stride:1},{...r.image,data:new Uint8Array(3)}])assert.throws(()=>run({records:[{...r,image}],...policy}));
 for(const changed of [{origin:[NaN,0]},{origin:[40000,0]},{fullWH:[4.5,3]},{fullWH:[32767,3]},{fullWH:[2,2]}])assert.throws(()=>run({records:[r,{...r,...changed}],...policy}));
 assert.throws(()=>run({records:[r],...policy,math:'max'}));assert.throws(()=>run({records:[r],...policy,rounding:'half-up'}));assert.throws(()=>run({records:null,...policy}));
});
test('记录组合接入base-frame：先饱和累积、分别整图resize，再作五步精修',()=>{
 const {refineSuppliedReferenceBaseRecords}=require('../inference/skin-reference/base-frame.cjs');
 const records=[record(new Uint8Array(13*9).fill(80),13,9,[0,0],[13,9]),record(new Uint8Array(13*9).fill(70),13,9,[0,0],[13,9])];
 const photo={data:new Uint8Array(9*11*3).fill(43),width:9,height:11,stride:27,format:301};
 const out=refineSuppliedReferenceBaseRecords({records,photo,...policy,range:new Float32Array(256).fill(1),spatial:new Float32Array(5).fill(1)});
 assert.deepEqual([out.updated,out.side,out.radius],[true,9,1]);assert.deepEqual(Array.from(out.ROI),[0,0,9,9]);
 assert.equal(out.mask.length,81);assert.ok(out.mask.every(v=>v===131));assert.ok(records[0].image.data.every(v=>v===80));assert.ok(photo.data.every(v=>v===43));
});
test('记录缺失不触及照片或weights；真实细长聚合仍保留base-frame无写门',()=>{
 const {refineSuppliedReferenceBaseRecords}=require('../inference/skin-reference/base-frame.cjs');
 const missing={records:[{fullWH:[8,8],image:null}],...policy};
 for(const key of ['photo','range','spatial'])Object.defineProperty(missing,key,{get(){throw Error('不得访问未可用供给');}});
 assert.equal(refineSuppliedReferenceBaseRecords(missing),null);
 const pixels=new Uint8Array(64);pixels.fill(255,16,24);
 const thin={records:[record(pixels,8,8,[0,0],[8,8])],photo:{data:new Uint8Array(8*11*3),width:8,height:11,stride:24,format:301},...policy};
 for(const key of ['range','spatial'])Object.defineProperty(thin,key,{get(){throw Error('不得访问bbox gate后weights');}});
 assert.deepEqual(refineSuppliedReferenceBaseRecords(thin),{updated:false,mask:null,ROI:null,radius:null,side:8});
});
