'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let stage;try{stage=require('../inference/skin-reference/color-map.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function present(){assert.equal(typeof stage?.applySuppliedReferenceColorMap,'function','integer color map stage is missing');}
function supply(size=64,format=301){
 const C=format===301?3:4,n=size===64?16:64,tiles=size===64?4:8,step=size*C;
 return {lut:new Uint8Array(size*step),lutSize:size,lutFormat:format,lutStride:step,
  coordinates:Int32Array.from({length:256},(_,v)=>size===64?Math.floor(1920*v/255):Math.max(32*v-1,0)),
  axis0:Int32Array.from({length:n+1},(_,i)=>Math.min(i,n-1)*C),
  axis1:Int32Array.from({length:n+1},(_,i)=>Math.min(i,n-1)*step),
  axis2:Int32Array.from({length:n+1},(_,i)=>{const j=Math.min(i,n-1);return Math.floor(j/tiles)*n*step+(j%tiles)*n*C;}),rounding:'integer-sar7-sar14'};
}
function fixture(){return {...supply(),source:Uint8Array.of(9,9,9,91,173),width:1,height:1,stride:5,channels:4};}
// 独立BigInt正权重分子+整数余数修正，不使用产品差分SAR表达式。
function oracle(r){
 const out=r.source.slice(),begin=r.begin??0,end=r.end??r.height;
 for(let y=begin;y<end;y++)for(let x=0;x<r.width;x++){
  const p=y*r.stride+x*r.channels,q=[0,1,2].map(c=>r.coordinates[r.source[p+c]]),bins=q.map(v=>Math.floor(v/128)),f=q.map(v=>BigInt(v%128));
  const offsets=[r.axis0,r.axis1,r.axis2].map((a,i)=>[a[bins[i]],a[bins[i]+1]]);
  for(let ch=0;ch<3;ch++){
   const planes=[];
   for(let z=0;z<2;z++){
    const sides=[];
    for(let t=0;t<2;t++)sides.push((128n-f[0])*BigInt(r.lut[offsets[0][0]+offsets[1][t]+offsets[2][z]+ch])+f[0]*BigInt(r.lut[offsets[0][1]+offsets[1][t]+offsets[2][z]+ch]));
    planes.push(((128n-f[1])*sides[0]+f[1]*sides[1]+64n)/128n);
   }
   const weighted=(128n-f[2])*planes[0]+f[2]*planes[1],residue=planes[0]%128n,num=weighted-128n*residue+128n;
   const floor=num>=0n?num/16384n:-((-num+16383n)/16384n);
   const value=Number(floor+(residue+64n)/128n);out[p+ch]=Math.max(0,Math.min(255,value));
  }
 }
 return out;
}
test('SAR7/SAR14保留split整数舍入，负差分不改成float插值',()=>{
 present();const r=fixture(),corners=[[0,240,128],[255,0,127],[12,15,255],[42,99,0],[202,230,12],[20,13,240],[125,33,3],[1,249,129]];
 for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)r.lut.set(corners[z*4+y*2+x],r.axis0[x]+r.axis1[y]+r.axis2[z]);
 // q(9)=67。三channel split结果80/109/110；普通一次round得到80/110/111。
 assert.deepEqual(stage.applySuppliedReferenceColorMap(r),Uint8Array.of(80,109,110,91,173));
});
test('64/512与LUT301/401独立于source3/4，256坐标端点、独立stride和partial行',()=>{
 present();
 for(const size of [64,512])for(const format of [301,401])for(const cn of [3,4]){
  const r={...supply(size,format),width:256,height:3,stride:256*cn+7,channels:cn,begin:1,end:2};r.source=new Uint8Array(r.stride*3+2).fill(173);
  for(let y=0;y<3;y++)for(let x=0;x<256;x++){const p=y*r.stride+x*cn;r.source.set([x,(17*x+11*y)&255,(53*x+23*y)&255],p);if(cn===4)r.source[p+3]=91;}
  for(let i=0;i<r.lut.length;i++)r.lut[i]=((i*43)^(i>>>3)^(i>>>11))&255;
  const keys=['source','lut','coordinates','axis0','axis1','axis2'],before=keys.map(k=>r[k].slice()),out=stage.applySuppliedReferenceColorMap(r);
  assert.deepEqual(out,oracle(r));assert.notEqual(out,r.source);keys.forEach((k,i)=>assert.deepEqual(r[k],before[i]));out.fill(0);keys.forEach((k,i)=>assert.deepEqual(r[k],before[i]));
 }
});
test('zero width和empty row range返回独立不变完整buffer',()=>{
 present();for(const patch of [{width:0},{begin:1,end:1}]){const r={...fixture(),...patch},out=stage.applySuppliedReferenceColorMap(r);assert.deepEqual(out,r.source);assert.notEqual(out,r.source);}
});
test('拒绝非packed LUT、表布局错配、越界与缺失整数舍入模式',()=>{
 present();const r=fixture();
 for(const patch of [{lutSize:128},{lutFormat:501},{lutStride:193},{lut:new Uint8Array(12287)},
  {coordinates:new Uint16Array(256)},{coordinates:new Int32Array(255)},{coordinates:new Int32Array(256)},
  {axis0:new Int32Array(17)},{axis1:new Int32Array(20)},{axis2:Int32Array.from({length:17},()=>-1)},
  {source:new Uint8Array(4)},{stride:3},{channels:2},{width:-1},{height:0},{begin:-1},{end:2},{begin:1,end:0},
  {rounding:undefined},{rounding:'nearest-even'}])assert.throws(()=>stage.applySuppliedReferenceColorMap({...r,...patch}));
 assert.throws(()=>stage.applySuppliedReferenceColorMap());
});
