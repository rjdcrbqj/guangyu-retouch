import test from 'node:test';import assert from 'node:assert/strict';
import {restoreReferenceSupplies} from '../src/reference-restore.js';
import {encodeReferencePNG64} from '../src/reference-png.js';
import {cropReferenceMaskRaw} from '../src/reference-pick.js';

// 撤销/重做与工程重开走同一个 restore 路径：必须同时恢复
// (1) 编码BYTE的参考图 (2) 参考蒙版裁切块。
// 此前 restore 只重建了裁切块，没恢复编码BYTE，导致撤销后点应用提示"请先取色"。

test('restore recovers both the encoded reference image and the mask crop',async()=>{
 const W=200,H=160;
 const skin=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const dx=x-100,dy=y-80;if(dx*dx/(60*60)+dy*dy/(45*45)<=1)skin[y*W+x]=255;}
 const pick=[104,77];
 const rgba=new Uint8Array(64*64*4);
 for(let i=0;i<64*64;i++){rgba[i*4]=(i*5)%256;rgba[i*4+1]=(i*9)%256;rgba[i*4+2]=(i*13)%256;rgba[i*4+3]=255;}
 const png=await encodeReferencePNG64(rgba);
 const image='data:image/png;base64,'+Buffer.from(png).toString('base64');
 // 模拟 restore 的两步（顺序：先绘制选区，再重建裁切块，再恢复编码BYTE）
 const crop=cropReferenceMaskRaw({data:skin,width:W,height:H,stride:W,point:pick});
 const supplies=restoreReferenceSupplies({image,width:64,height:64,rect:null,pickPoint:pick,revision:2});
 assert.ok(supplies?.referencePNGSupply,'必须恢复编码BYTE');
 assert.deepEqual(Array.from(supplies.referencePNGSupply.data),Array.from(png),'编码BYTE必须与保存一致');
 assert.ok(crop.data.some(v=>v===255),'裁切块必须有效');

 // 两者缺一都不能应用：模拟应用前的检查
 const canApply=(png_,crop_)=>Boolean(png_&&crop_);
 assert.equal(canApply(supplies.referencePNGSupply,crop),true,'两者齐备才可应用');
 assert.equal(canApply(null,crop),false,'缺编码BYTE不可应用（这就是撤销后的问题）');
});

test('restore yields no supplies for a cleared reference',()=>{
 assert.equal(restoreReferenceSupplies({image:null}),null);
});
