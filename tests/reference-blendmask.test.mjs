import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {applyPreparedReferenceResult}=require('../inference/skin-reference/prepared-result.cjs');

// blendMask 决定哪些像素允许被参考处理改变（output-row 里 mask==0 直接 continue）。
// 若整幅都传255，参考效果会作用到非皮肤区域。

const W=8,H=8;
function run(blendMaskValue){
 const src=new Uint8Array(W*H*4);
 for(let i=0;i<W*H;i++){src[i*4]=10;src[i*4+1]=10;src[i*4+2]=10;src[i*4+3]=255;}
 const mask=new Uint8Array(W*H).fill(blendMaskValue);
 const heads={coefficients:(()=>{const c=new Float32Array(9*768*768);c[0]=50;return c;})(),
  mask:new Float32Array(768*768).fill(1)};
 return applyPreparedReferenceResult({
  source:src,width:W,height:H,stride:W*4,channels:4,
  geometry:{valid:true,originalROI:Int32Array.from([0,0,W,H]),
   postAffine:Float32Array.from([1,0,0,0,1,0])},
  heads,blendMask:mask,blendMaskStride:W,
  secondaryTestMask:new Uint8Array(W*H),secondaryTestMaskStride:W,
  intensity:1});
}
test('blendMask=0 prevents any pixel from being changed',()=>{
 const out=run(0);
 assert.equal(out.changedRGBFields,0,'mask全0时不得改变任何像素');
});
test('blendMask=255 allows the effect to change pixels',()=>{
 const out=run(255);
 assert.ok(out.changedRGBFields>0,'mask全255时应有像素变化');
});
test('a partial mask limits the change to the masked pixels only',()=>{
 const src=new Uint8Array(W*H*4);
 for(let i=0;i<W*H;i++){src[i*4]=10;src[i*4+1]=10;src[i*4+2]=10;src[i*4+3]=255;}
 const mask=new Uint8Array(W*H); mask[0]=255; mask[1]=255;   // 只有前两个像素
 const heads={coefficients:(()=>{const c=new Float32Array(9*768*768);c[0]=50;return c;})(),
  mask:new Float32Array(768*768).fill(1)};
 const out=applyPreparedReferenceResult({
  source:src,width:W,height:H,stride:W*4,channels:4,
  geometry:{valid:true,originalROI:Int32Array.from([0,0,W,H]),
   postAffine:Float32Array.from([1,0,0,0,1,0])},
  heads,blendMask:mask,blendMaskStride:W,
  secondaryTestMask:new Uint8Array(W*H),secondaryTestMaskStride:W,intensity:1});
 // 只允许前两个像素变化
 assert.ok(out.changedRGBFields>0 && out.changedRGBFields<=6,'只应改变被mask的像素的RGB');
});

test('using the user selection as the blend mask keeps changes inside it',()=>{
 // 这是修复后的产品行为：参考效果只作用在用户画的皮肤选区内。
 const W2=48,H2=32;
 const src=new Uint8Array(W2*H2*4);
 for(let y=0;y<H2;y++)for(let x=0;x<W2;x++){const i=(y*W2+x)*4;src[i]=30;src[i+1]=30;src[i+2]=30;src[i+3]=255;}
 const sel=new Uint8Array(W2*H2);
 for(let y=0;y<H2;y++)for(let x=0;x<W2;x++){const dx=x-24,dy=y-16;if(dx*dx/(12*12)+dy*dy/(8*8)<=1)sel[y*W2+x]=255;}
 // 系数必须落在选区内：postAffine 为恒等，故像素(x,y)读取索引 y*768+x。
 // 选中心 (24,16) -> 索引 16*768+24。
 const IN=16*768+24;
 const heads={coefficients:(()=>{const c=new Float32Array(9*768*768);c[IN]=50;return c;})(),
  mask:new Float32Array(768*768).fill(1)};
 const out=applyPreparedReferenceResult({
  source:src,width:W2,height:H2,stride:W2*4,channels:4,
  geometry:{valid:true,originalROI:Int32Array.from([0,0,W2,H2]),
   postAffine:Float32Array.from([1,0,0,0,1,0])},
  heads,blendMask:sel,blendMaskStride:W2,
  secondaryTestMask:new Uint8Array(W2*H2),secondaryTestMaskStride:W2,intensity:1});
 // 逐像素核对：选区外必须原样
 let outsideChanged=0,insideChanged=0;
 for(let i=0;i<W2*H2;i++){
  const changed=(out.output[i*4]!==src[i*4])||(out.output[i*4+1]!==src[i*4+1])||(out.output[i*4+2]!==src[i*4+2]);
  if(sel[i]){if(changed)insideChanged++;}else if(changed)outsideChanged++;
 }
 assert.equal(outsideChanged,0,'选区外不得改变');
 assert.ok(insideChanged>0,'选区内应有改变');
});
