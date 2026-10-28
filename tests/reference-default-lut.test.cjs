'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const POLICY='normal-source-icc-gamma-off-generic-code4';
const ASSET=path.join(__dirname,'../inference/assets/skin-reference/default-lut-normal-source-rgb301.bin');
function api(){return require('../inference/skin-reference/default-lut.cjs').loadNormalSourceReferenceColorMap;}
test('defaultLUT 明确normal-source条件读取exact RGB301资产与canonical表',()=>{
 const r=api()({policy:POLICY}),c=r.colorMap;
 assert.deepEqual([c.lutSize,c.lutFormat,c.lutStride,c.lut.length],[512,301,1536,786432]);
 assert.equal(crypto.createHash('sha256').update(c.lut).digest('hex'),'a0b937d1a6eab0d439e2f634b60f44ca23758670a9e8fb0c67cdd951646ccb82');
 assert.equal(c.rounding,'integer-sar7-sar14');
 for(let i=0;i<256;i++)assert.equal(c.coordinates[i],Math.max(32*i-1,0));
 for(let i=0;i<65;i++){
  const j=Math.min(i,63);assert.equal(c.axis0[i],3*j);assert.equal(c.axis1[i],1536*j);
  assert.equal(c.axis2[i],Math.floor(j/8)*64*1536+j%8*64*3);
 }
 assert.equal(r.provenance.policy,POLICY);assert.equal(r.provenance.actualOriginalDecoderExecuted,false);
 assert.equal(r.provenance.sourcePNGsha256,'91c5570b6a9f3f18a10b1fc6384920cd7e7e30047c20329f0003dfeaf75f371b');
});
test('defaultLUT 调用方资产buffer和两份返回table/像素均独立',()=>{
 const raw=fs.readFileSync(ASSET),before=Uint8Array.from(raw),load=api();let reads=0;
 const readFile=()=>{reads++;return raw;},a=load({policy:POLICY,readFile}),b=load({policy:POLICY,readFile});
 assert.equal(reads,2);assert.notEqual(a.colorMap.lut.buffer,raw.buffer);assert.notEqual(a.colorMap.lut.buffer,b.colorMap.lut.buffer);
 a.colorMap.lut.fill(0);a.colorMap.coordinates.fill(0);a.colorMap.axis2.fill(0);
 assert.deepEqual(raw,Buffer.from(before));assert.deepEqual(b.colorMap.lut,before);
 assert.equal(b.colorMap.coordinates[255],8159);assert.equal(b.colorMap.axis2[64],689472);
 assert.ok(Object.isFrozen(a.provenance));
});
test('defaultLUT 未声明条件不读取文件,长度/hash/type及读取失败可见',()=>{
 const load=api();let reads=0;const readFile=()=>{reads++;throw Error('should not read');};
 for(const policy of [undefined,'auto','normal-source-icc-gamma-off'])assert.throws(()=>load({policy,readFile}),/条件/);
 assert.equal(reads,0);
 const raw=fs.readFileSync(ASSET),corrupt=Uint8Array.from(raw);corrupt[12345]^=1;
 assert.throws(()=>load({policy:POLICY,readFile:()=>raw.subarray(0,raw.length-1)}),/长度/);
 assert.throws(()=>load({policy:POLICY,readFile:()=>corrupt}),/SHA256/);
 assert.throws(()=>load({policy:POLICY,readFile:()=>new Float32Array(raw.length)}),/BYTE/);
 assert.throws(()=>load({policy:POLICY,readFile:()=>{throw Error('asset missing');}}),/asset missing/);
});
