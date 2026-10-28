import test from 'node:test';import assert from 'node:assert/strict';
import {restoreReferenceSupplies} from '../src/reference-restore.js';
import {cropReferenceMaskRaw} from '../src/reference-pick.js';
import {normalizeReferenceState} from '../src/reference-skin-state.js';
import {encodeReferencePNG64} from '../src/reference-png.js';

// 工程往返：保存 -> 校验/恢复 -> 重建通道供给。
// 恢复后必须能再次应用：参考图编码BYTE可还原，参考蒙版裁切块可由
// 已恢复的皮肤选区 + 保存的取点按同一规则重建。

test('a saved reference survives the project round trip and can be applied again',async()=>{
 const W=200,H=160;
 // 原始选区与取点
 const skin=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const dx=x-100,dy=y-80;if(dx*dx/(60*60)+dy*dy/(45*45)<=1)skin[y*W+x]=255;}
 const pick=[104,77];
 const crop=cropReferenceMaskRaw({data:skin,width:W,height:H,stride:W,point:pick});
 // 参考图（64x64）
 const rgba=new Uint8Array(64*64*4);
 for(let i=0;i<64*64;i++){rgba[i*4]=(i*5)%256;rgba[i*4+1]=(i*9)%256;rgba[i*4+2]=(i*13)%256;rgba[i*4+3]=255;}
 const png=await encodeReferencePNG64(rgba);
 const dataUrl='data:image/png;base64,'+Buffer.from(png).toString('base64');
 // 保存的参考状态（含取点）
 const saved=normalizeReferenceState({image:dataUrl,width:64,height:64,rect:null,pickPoint:pick,revision:3});
 assert.deepEqual(Array.from(saved.pickPoint),pick,'取点必须被持久化');
 // 恢复：编码BYTE
 const restored=restoreReferenceSupplies(saved);
 assert.deepEqual(Array.from(restored.referencePNGSupply.data),Array.from(png));
 // 恢复：蒙版裁切块按同一规则重建，必须与原裁切一致
 const rebuilt=cropReferenceMaskRaw({data:skin,width:W,height:H,stride:W,point:saved.pickPoint});
 assert.deepEqual(Array.from(rebuilt.data),Array.from(crop.data));
 assert.deepEqual(rebuilt.rect,crop.rect);
});

test('a legacy reference without a pickPoint restores its image but not a mask crop',async()=>{
 const rgba=new Uint8Array(64*64*4);for(let i=0;i<64*64;i++)rgba[i*4+3]=255;
 const png=await encodeReferencePNG64(rgba);
 const legacy=normalizeReferenceState({image:'data:image/png;base64,'+Buffer.from(png).toString('base64'),width:64,height:64,revision:1});
 assert.equal(legacy.pickPoint,null,'旧工程没有取点');
 const r=restoreReferenceSupplies(legacy);
 assert.ok(r.referencePNGSupply,'参考图仍可恢复');
 // 没有取点就不重建蒙版——交给用户重新取色，不伪造
 assert.equal(legacy.pickPoint,null);
});
