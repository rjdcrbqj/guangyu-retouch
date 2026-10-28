import test from 'node:test';import assert from 'node:assert/strict';
import {cropReferencePatch,cropReferenceMaskRaw,requireFullReferencePatch} from '../src/reference-pick.js';

// 方向边界：竖图与极扁图。取色器用 overlay.width/height 做映射，
// 这里验证裁切规则在非方形图上依然成立，且不会越界。

function rgba(w,h){const d=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){d[i*4]=9;d[i*4+3]=255;}return d;}

test('portrait images crop correctly and stay in bounds',()=>{
 const W=600,H=1600;               // 竖图
 const patch=cropReferencePatch({data:rgba(W,H),width:W,height:H,point:[300,800]});
 assert.deepEqual(patch.rect,[268,768,64,64]);
 requireFullReferencePatch(patch.rect);
 assert.ok(patch.rect[0]+patch.rect[2]<=W);
 assert.ok(patch.rect[1]+patch.rect[3]<=H);
});

test('very wide images shrink at the right edge, never exceeding bounds',()=>{
 const W=4000,H=200;               // 极扁
 const patch=cropReferencePatch({data:rgba(W,H),width:W,height:H,point:[W-1,100]});
 const [x,y,w,h]=patch.rect;
 assert.ok(x+w<=W && y+h<=H);
 assert.ok(w<=64 && h<=64);
 // 右边缘应缩小而不是推回
 assert.ok(w<64,'右边缘应缩小');
});

test('mask crop follows the same rule for portrait photos',()=>{
 const W=600,H=1600;
 const m=new Uint8Array(W*H).fill(255);
 const r=cropReferenceMaskRaw({data:m,width:W,height:H,stride:W,point:[300,800]});
 assert.deepEqual(r.rect,[268,768,64,64]);
 assert.equal(r.data.length,64*64);
 assert.ok(r.data.every(v=>v===255));
});
