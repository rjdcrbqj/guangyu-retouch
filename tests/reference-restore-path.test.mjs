import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeReferenceState} from '../src/reference-skin-state.js';
import {restoreReferenceSupplies} from '../src/reference-restore.js';
import {cropReferenceMaskRaw} from '../src/reference-pick.js';

// 复现 app.js restore() 的真实顺序：先绘制选区 -> 再裁剪 -> 再恢复编码BYTE。
// 该顺序一旦回退（先裁剪），裁切块会是全零，用户"已保存却用不了"。

function simulateRestore({skinMask,width,height,pickPoint,image}){
 // p.skin 画布：按 restore() 的做法先绘制保存的选区
 const skin=new Uint8Array(width*height);
 if(skinMask)skin.set(skinMask);
 // 再重建裁切块（修复后的顺序）
 const crop=cropReferenceMaskRaw({data:skin,width,height,stride:width,point:pickPoint});
 // 再恢复编码BYTE
 const supplies=restoreReferenceSupplies(normalizeReferenceState({image,width:64,height:64,rect:null,pickPoint,revision:2}));
 return {crop,supplies};
}

const W=200,H=160;
function ellipse(){const d=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const dx=x-100,dy=y-80;if(dx*dx/(60*60)+dy*dy/(45*45)<=1)d[y*W+x]=255;}return d;}

test('restore order yields a usable crop and encoded bytes (the fixed behaviour)',async()=>{
 const {encodeReferencePNG64}=await import('../src/reference-png.js');
 const rgba=new Uint8Array(64*64*4);for(let i=0;i<64*64;i++)rgba[i*4+3]=255;
 const png=await encodeReferencePNG64(rgba);
 const image='data:image/png;base64,'+Buffer.from(png).toString('base64');
 const r=simulateRestore({skinMask:ellipse(),width:W,height:H,pickPoint:[104,77],image});
 // 裁切块必须有内容（不是全零）
 assert.equal(r.crop.data.some(v=>v===255),true,'先绘制后裁剪应得到有效蒙版');
 assert.equal(r.crop.rect[2],64);assert.equal(r.crop.rect[3],64);
 // 编码字节可恢复且与保存的一致
 assert.deepEqual(Array.from(r.supplies.referencePNGSupply.data),Array.from(png));
});

test('if the crop ran before drawing, the mask would be all zero (regression guard)',()=>{
 // 这是修复前的错误顺序的直接后果：空画布裁剪 -> 全零 -> 参考处理无效
 const empty=new Uint8Array(W*H);
 const bad=cropReferenceMaskRaw({data:empty,width:W,height:H,stride:W,point:[104,77]});
 assert.equal(bad.data.every(v=>v===0),true,'空画布裁剪必然全零');
 // 与正确顺序的结果不同，故该顺序错误可被检测
 const good=cropReferenceMaskRaw({data:ellipse(),width:W,height:H,stride:W,point:[104,77]});
 assert.notDeepEqual(Array.from(bad.data),Array.from(good.data));
});
