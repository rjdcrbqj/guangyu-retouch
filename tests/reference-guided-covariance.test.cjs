'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let stage;try{stage=require('../inference/skin-reference/guided-covariance.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function requireStage(){assert.equal(typeof stage?.covariance3,'function','covariance helper is missing');assert.equal(typeof stage?.inverseSymmetric3,'function','inverse helper is missing');}
function bits(a){return Array.from(new Uint32Array(a.buffer,a.byteOffset,a.length));}
test('供应means/products的每像素upper triangle协方差，diag加epsilon且不改输入',()=>{
 requireStage();const means=Float32Array.from([2,3,5,1,2,4]),meanProducts=Float32Array.from([7,8,14,13,17,30,1,2,4,4,8,16]);
 const before=[means.slice(),meanProducts.slice()],out=stage.covariance3({means,meanProducts,epsilon:.25,rounding:'nearest-even'});
 assert(out instanceof Float32Array);assert.deepEqual(Array.from(out),[3.25,2,5.25,3,2,5.25,.25,0,.25,0,0,.25]);
 assert.deepEqual(means,before[0]);assert.deepEqual(meanProducts,before[1]);out.fill(0);assert.deepEqual(means,before[0]);assert.deepEqual(meanProducts,before[1]);
});
test('协方差先F32乘积再减，不将两步融合',()=>{
 requireStage();const out=stage.covariance3({means:Float32Array.from([.1,.1,.1]),meanProducts:Float32Array.from({length:6},()=>.01),epsilon:0,rounding:'nearest-even'});
 assert.deepEqual(bits(out),Array(6).fill(0xb0800000));
});
test('逆矩阵cofactor顺序和00,01,11,02,12,22输出布局',()=>{
 requireStage();const triangle=Float32Array.from([4,1,3,2,0,5]),before=triangle.slice();
 const out=stage.inverseSymmetric3({triangle,rounding:'nearest-even'});
 assert.deepEqual(bits(out),[0x3eb29aca,0xbdee23b8,0x3ebe82fa,0xbe0ee23c,0x3d3e82fa,0x3e82fa0c]);
 assert.deepEqual(triangle,before);out.fill(0);assert.deepEqual(triangle,before);
 const grouped=stage.inverseSymmetric3({triangle:Float32Array.from([13.25,-3.625,4.984375,14.296875,-9.796875,10.546875]),rounding:'nearest-even'});
 // 独立Fraction F32 oracle：规定det bits c43346b0，错误(cC+aA)+bB为c43346b2。
 assert.deepEqual(bits(grouped),[0x3d77f277,0x3e1169b4,0x3db8a619,0x3d4c2f02,0xbddeb65a,0xbd9715db]);
});
test('singular和有限输入溢出保留IEEE非有限输出，无det0保护',()=>{
 requireStage();const zero=stage.inverseSymmetric3({triangle:new Float32Array(6),rounding:'nearest-even'});assert(zero.every(Number.isNaN));
 const rank2=stage.inverseSymmetric3({triangle:Float32Array.from([1,0,1,0,0,0]),rounding:'nearest-even'});assert(rank2.subarray(0,5).every(Number.isNaN));assert.equal(rank2[5],Infinity);
 const overflow=stage.covariance3({means:Float32Array.from([3e38,0,0]),meanProducts:new Float32Array(6),epsilon:0,rounding:'nearest-even'});assert.equal(overflow[0],-Infinity);
});
test('拒绝未供应/非有限输入和packed长度错配，不假装生成means',()=>{
 requireStage();const r={means:new Float32Array(3),meanProducts:new Float32Array(6),epsilon:0,rounding:'nearest-even'};
 for(const patch of [{means:[]},{means:new Float32Array(0)},{means:new Float32Array(4)},{meanProducts:new Float32Array(5)},
  {means:Float32Array.from([NaN,0,0])},{meanProducts:Float32Array.from([0,0,0,0,Infinity,0])},{epsilon:undefined},{epsilon:Infinity},{epsilon:1e100},{rounding:undefined},{rounding:'down'}])assert.throws(()=>stage.covariance3({...r,...patch}));
 for(const triangle of [[],new Float32Array(0),new Float32Array(5),Float32Array.from([NaN,0,0,0,0,0])])assert.throws(()=>stage.inverseSymmetric3({triangle,rounding:'nearest-even'}));
 assert.throws(()=>stage.covariance3());assert.throws(()=>stage.inverseSymmetric3());assert.throws(()=>stage.inverseSymmetric3({triangle:new Float32Array(6)}));
});
