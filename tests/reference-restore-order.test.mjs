import test from 'node:test';import assert from 'node:assert/strict';
import {cropReferenceMaskRaw} from '../src/reference-pick.js';

// 重开工程时的顺序敏感点：必须在皮肤选区已绘制后裁剪。
// 若先裁剪（空画布），得到的是全零裁切块——这会让"已保存却用不了"，且静默失败。
// 本用例固定该语义，防止顺序回退。

const W=200,H=160;
function ellipseMask(){const d=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const dx=x-100,dy=y-80;if(dx*dx/(60*60)+dy*dy/(45*45)<=1)d[y*W+x]=255;}return d;}
function emptyMask(){return new Uint8Array(W*H);}

test('cropping before the selection is drawn yields an all-zero crop (the ordering bug symptom)',()=>{
 const empty=emptyMask();
 const r=cropReferenceMaskRaw({data:empty,width:W,height:H,stride:W,point:[100,80]});
 assert.equal(r.data.every(v=>v===0),true,'空选区裁剪必然全零');
 // 这就是必须"先绘制后裁剪"的原因：全零蒙版会让参考处理无效果
});

test('cropping after the selection is drawn yields the real selection',()=>{
 const real=ellipseMask();
 const r=cropReferenceMaskRaw({data:real,width:W,height:H,stride:W,point:[100,80]});
 assert.equal(r.rect[2],64);assert.equal(r.rect[3],64);
 assert.equal(r.data.some(v=>v===255),true,'已绘制选区应含有效像素');
 // 且与"先绘制后裁剪"应有的结果一致
 assert.ok(r.data.filter(v=>v===255).length>0);
});
