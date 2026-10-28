import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {SkinReferenceProcessor}=require('../inference/skin-reference/processor.cjs');
const zlib=require('node:zlib');
import {encodeReferencePNG64} from '../src/reference-png.js';

// 参考强度必须真的改变输出：这是用户能直接感知的行为，此前从未被验证。
// 使用固定合成输入 + 固定假后端输出，只改变 intensity，观察像素差异量。

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
const W=96,H=64;

function build(){
 const rgba=new Uint8Array(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;rgba[i]=20;rgba[i+1]=40;rgba[i+2]=60;rgba[i+3]=255;}
 return rgba;
}
function pngPayload(){
 const p=new Uint8Array(64*64*4);
 for(let i=0;i<64*64;i++){p[i*4]=200;p[i*4+1]=180;p[i*4+2]=160;p[i*4+3]=255;}
 return p;
}
async function runWith(intensity){
 const rgba=build();
 const png=await encodeReferencePNG64(pngPayload());
 // 固定的假后端输出：coefficients 全零，mask 全 +1（归一化后为 1.0，最大影响）
 // 系数必须非零，否则模型本身没有颜色增量，强度无处可缩放（那是输入问题，不是缺陷）。
 const coeff=(()=>{const c=new Float32Array(9*768*768);c[0]=40;c[1]=-25;c[2]=15;return c;})();
 const models={run(){return Promise.resolve({
  coefficients:coeff,
  mask:new Float32Array(768*768).fill(1)});},async close(){}};
 const p=new SkinReferenceProcessor({models});
 try{
  const out=await p.run({
   original:{data:rgba,width:W,height:H,stride:W*4,channels:4},
   workingPhoto:{data:new Uint8Array(W*H*3).fill(60),width:W,height:H,stride:W*3,format:301},
   temporaryMask:{data:new Uint8Array(W*H).fill(255),width:W,height:H,stride:W},
   geometry:{valid:true,originalROI:Int32Array.from([0,0,W,H]),
    inputForward:Float32Array.from([Math.fround(768/W),0,0,0,Math.fround(768/H),0]),
    postAffine:Float32Array.from([1,0,0,0,1,0])},
   referencePNG:{data:png,policy:POLICY},
   referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
   blendMask:new Uint8Array(W*H).fill(255),blendMaskStride:W,
   secondaryTestMask:new Uint8Array(W*H),secondaryTestMaskStride:W,
   intensity,referenceRevision:1});
  return out.output;
 }finally{await p.close();}
}

test('intensity actually changes the output pixels',async()=>{
 const low=await runWith(0.0);
 const mid=await runWith(0.5);
 const high=await runWith(1.0);
 // 零强度必须完全不改像素
 assert.deepEqual(Array.from(low),Array.from(build()),'intensity=0 必须原样返回');
 // 非零强度必须产生差异
 const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n;};
 assert.ok(diff(low,mid)>0,'intensity=0.5 必须改变像素');
 assert.ok(diff(mid,high)>0,'intensity=1 必须比 0.5 改变更多或不同');
 // 强度越大，偏离原图越远（单调性，按总绝对差）
 const absDev=(out)=>{let s=0;const o=build();for(let i=0;i<out.length;i++)s+=Math.abs(out[i]-o[i]);return s;};
 assert.ok(absDev(low)<=absDev(mid),'0 <= 0.5 偏离');
 assert.ok(absDev(mid)<=absDev(high),'0.5 <= 1.0 偏离');
});

test('with zero model coefficients intensity has nothing to scale (input, not a defect)',async()=>{
 // 记录该语义：系数全零表示模型判定"无需改色"，此时任何强度都不改像素。
 const rgba=new Uint8Array(W*H*4);
 for(let i=0;i<W*H;i++){rgba[i*4]=20;rgba[i*4+1]=40;rgba[i*4+2]=60;rgba[i*4+3]=255;}
 const png=await encodeReferencePNG64(pngPayload());
 for(const intensity of [0,0.5,1]){
  const models={run(){return Promise.resolve({coefficients:new Float32Array(9*768*768),mask:new Float32Array(768*768).fill(1)});},async close(){}};
  const p=new SkinReferenceProcessor({models});
  const out=await p.run({
   original:{data:rgba,width:W,height:H,stride:W*4,channels:4},
   workingPhoto:{data:new Uint8Array(W*H*3).fill(60),width:W,height:H,stride:W*3,format:301},
   temporaryMask:{data:new Uint8Array(W*H).fill(255),width:W,height:H,stride:W},
   geometry:{valid:true,originalROI:Int32Array.from([0,0,W,H]),
    inputForward:Float32Array.from([Math.fround(768/W),0,0,0,Math.fround(768/H),0]),
    postAffine:Float32Array.from([1,0,0,0,1,0])},
   referencePNG:{data:png,policy:POLICY},
   referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
   blendMask:new Uint8Array(W*H).fill(255),blendMaskStride:W,
   secondaryTestMask:new Uint8Array(W*H),secondaryTestMaskStride:W,
   intensity,referenceRevision:1});
  await p.close();
  assert.equal(out.changedRGBFields,0,'系数全零时强度不产生变化');
 }
});
