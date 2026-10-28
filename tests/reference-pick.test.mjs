'use strict';
import test from 'node:test';import assert from 'node:assert/strict';
import {cropReferencePatch,cropReferenceMaskRaw} from '../src/reference-pick.js';

// 裁剪规则来自 LIVE 142ea0a50（phase42）：origin=clamp(point-32,0,D-1)，size=min(64,D-origin)。
// 边缘可小于64；不制造默认尺寸，不把手工选区当作原版 M6。

function rgba(w,h,fill){
 const d=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++)d.set([fill,fill,fill,255],i*4);return d;
}
function mono(w,h,fn){
 const d=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)d[y*w+x]=fn(x,y);return d;
}

test('crop uses clamp(point-32,0,D-1) and min(64,D-origin) at the interior',()=>{
 const d=rgba(200,200,9);
 const r=cropReferencePatch({data:d,width:200,height:200,point:[100,100]});
 assert.deepEqual(r.rect,[68,68,64,64]);
 assert.equal(r.width,64);assert.equal(r.height,64);assert.equal(r.stride,256);
 // 裁剪内容必须来自正确位置
 const px=(x,y)=>d[(y*200+x)*4];
 assert.equal(r.data[0],px(68,68));assert.equal(r.data[(63*64+63)*3],px(131,131));
});

test('crop shrinks at the edges instead of clamping the window back inside',()=>{
 const d=rgba(200,200,4);
 const topLeft=cropReferencePatch({data:d,width:200,height:200,point:[0,0]});
 assert.deepEqual(topLeft.rect,[0,0,64,64]);
 const br=cropReferencePatch({data:d,width:200,height:200,point:[199,199]});
 // origin=min(point-32, D-1)=167, size=min(64,200-167)=33
 assert.deepEqual(br.rect,[167,167,33,33]);
 assert.equal(br.width,33);assert.equal(br.height,33);assert.equal(br.stride,132);
 const mid=cropReferencePatch({data:d,width:200,height:200,point:[180,20]});
 assert.deepEqual(mid.rect,[148,0,52,64]);
});

test('crop of a 1-pixel image still yields at least one pixel',()=>{
 const d=rgba(1,1,7);
 const r=cropReferencePatch({data:d,width:1,height:1,point:[0,0]});
 assert.deepEqual(r.rect,[0,0,1,1]);assert.equal(r.data[0],7);
});

test('reference mask crops the same rect without resizing (resize is done downstream)',()=>{
 // 产品自身皮肤选区（画布分辨率）作为参考蒙版来源，不是原版 M6。
 const m=mono(200,200,(x,y)=>(x>=68&&x<132&&y>=68&&y<132)?255:0);
 const r=cropReferenceMaskRaw({data:m,width:200,height:200,stride:200,point:[100,100]});
 assert.deepEqual(r.rect,[68,68,64,64]);
 assert.equal(r.width,64);assert.equal(r.height,64);assert.equal(r.stride,64);
 assert.equal(r.data.length,4096);
 assert.ok(r.data.every(v=>v===255),'64×64裁剪应全部落在选区内');
 // 边缘点：只裁切，不放大；放大由主进程用已验证mono64完成
 const small=cropReferenceMaskRaw({data:mono(200,200,()=>255),width:200,height:200,stride:200,point:[199,199]});
 assert.deepEqual(small.rect,[167,167,33,33]);
 assert.equal(small.width,33);assert.equal(small.height,33);
 assert.equal(small.data.length,33*33);
});

test('pick rejects malformed supplies rather than inventing a patch',()=>{
 assert.throws(()=>cropReferencePatch(),TypeError);
 assert.throws(()=>cropReferencePatch({data:new Uint8Array(4),width:1,height:1}),TypeError);
 assert.throws(()=>cropReferencePatch({data:new Uint8Array(400),width:10,height:10,point:[1]}),TypeError);
 assert.throws(()=>cropReferencePatch({data:new Uint8Array(400),width:10,height:10,point:[1.5,2]}),TypeError);
 assert.throws(()=>cropReferencePatch({data:new Uint8Array(400),width:10,height:10,point:[-1,2]}),RangeError);
 assert.throws(()=>cropReferencePatch({data:new Uint8Array(400),width:10,height:10,point:[10,2]}),RangeError);
 assert.throws(()=>cropReferenceMaskRaw({data:new Uint8Array(100),width:10,height:10,stride:9,point:[1,1]}),TypeError);
});
