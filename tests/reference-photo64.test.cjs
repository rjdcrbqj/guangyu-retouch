'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const golden=require('./fixtures/reference-photo64-new-golden.json');
function api(){return require('../inference/skin-reference/photo64.cjs').prepareSuppliedReferencePhoto64;}
test('photo64 CVflag1:32→64 x1=64,独立于mono code2',()=>{
 const run=api(),data=new Uint8Array(32*32*3);
 for(let y=0;y<32;y++)for(let c=0;c<3;c++)data[(y*32+1)*3+c]=255;
 const original=data.slice(),out=run({data,width:32,height:32,stride:96,format:301,rounding:'nearest-even'});
 assert.deepEqual([out.width,out.height,out.stride,out.format],[64,64,192,301]);
 assert.deepEqual(Array.from(out.data.slice(3,6)),[64,64,64]);
 assert.deepEqual(Array.from(out.data.slice(0,3)),[0,0,0]);
 assert.deepEqual(data,original);assert.notEqual(out.data.buffer,data.buffer);
});
test('photo64 两个新有理golden覆盖分段整数舍入/各轴不同尺寸',()=>{
 const run=api();assert.equal(golden.originalNative,0);assert.ok(golden.wrongSingleRoundDifferences>3000);
 for(const g of golden.fixtures){
  const stride=g.width*3+5,data=new Uint8Array(stride*g.height+7).fill(211);
  for(let y=0;y<g.height;y++)data.set(g.data.slice(y*g.width*3,(y+1)*g.width*3),y*stride);
  const original=data.slice(),out=run({data,width:g.width,height:g.height,stride,format:300,rounding:'nearest-even'});
  assert.deepEqual(out.data,Uint8Array.from(g.expected));assert.equal(out.format,300);
  assert.deepEqual(data,original);assert.notEqual(data.buffer,out.data.buffer);
 }
});
test('photo64 双64只复制active rows,不携padding,同图多次输出独立',()=>{
 const run=api(),stride=197,data=Uint8Array.from({length:stride*64+11},(_,i)=>(i*31+19)%256);
 const r={data,width:64,height:64,stride,format:301,rounding:'nearest-even'},a=run(r),b=run(r);
 assert.equal(a.data.length,12288);
 for(let y=0;y<64;y++)assert.deepEqual(a.data.slice(y*192,(y+1)*192),data.slice(y*stride,y*stride+192));
 a.data.fill(0);assert.notEqual(b.data[0],0);assert.equal(data[0],19);
});
test('photo64 width64 height2保持列和边缘,不把photo套mask endpoint步长',()=>{
 const run=api(),data=new Uint8Array(64*2*3);
 for(let x=0;x<64;x++)data.set([x,100,255-x],x*3);
 for(let x=0;x<64;x++)data.set([255-x,200,x],(64+x)*3);
 const out=run({data,width:64,height:2,stride:192,format:300,rounding:'nearest-even'});
 assert.deepEqual(out.data.slice(0,192),data.slice(0,192));
 assert.deepEqual(out.data.slice(63*192),data.slice(192));
 assert.deepEqual(Array.from(out.data.slice((16*64+5)*3,(16*64+5)*3+3)),[9,101,246]);
});
test('photo64 显式有限域/格式/stride/RN拒绝',()=>{
 const run=api(),data=new Uint8Array(12),r={data,width:2,height:2,stride:6,format:300,rounding:'nearest-even'};
 for(const change of [{width:1},{height:32767},{width:2.5},{stride:5},{stride:7},{format:401},{format:'300'},{rounding:'toward-zero'},{data:new Float32Array(12)}])
  assert.throws(()=>run({...r,...change}));
 assert.deepEqual(data,new Uint8Array(12));
});
test('photo64 down新增:2..32766输入各轴可放大/缩小,不共享mode2步长',()=>{
 const run=api(),cases=require('./fixtures/reference-photo64-down-new-golden.json');
 for(const g of cases.fixtures){
  const data=Uint8Array.from(g.data),before=data.slice();
  const out=run({data,width:g.width,height:g.height,stride:g.width*3,format:301,rounding:'nearest-even'});
  assert.deepEqual(out.data,Uint8Array.from(g.expected));assert.deepEqual(data,before);
 }
 const data=new Uint8Array(32766*2*3).fill(83);
 const out=run({data,width:32766,height:2,stride:32766*3,format:300,rounding:'nearest-even'});
 assert.equal(out.data.length,12288);assert.ok(out.data.every(v=>v===83));
 assert.throws(()=>run({data,width:32766,height:32766,stride:32766*3,format:300,rounding:'nearest-even'}));
});
test('photo64 down新增:128平方精确2x2分支按三个物理通道整数平均',()=>{
 const run=api(),stride=128*3+7,data=new Uint8Array(stride*128+9).fill(219),expected=new Uint8Array(12288);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++)for(let c=0;c<3;c++)data[y*stride+x*3+c]=(x*29+y*13+c*71)%256;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)for(let c=0;c<3;c++){
  const p=y*2*stride+x*6+c;
  expected[(y*64+x)*3+c]=(data[p]+data[p+3]+data[p+stride]+data[p+stride+3]+2)>>2;
 }
 const before=data.slice(),out=run({data,width:128,height:128,stride,format:300,rounding:'nearest-even'});
 assert.deepEqual(out.data,expected);assert.deepEqual(data,before);assert.notEqual(out.data.buffer,data.buffer);
});
