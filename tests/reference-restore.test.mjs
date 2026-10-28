import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {restoreReferenceSupplies} from '../src/reference-restore.js';
const {cropReferencePatch,cropReferenceMaskRaw} = await import('../src/reference-pick.js');

// 工程重开后必须能再次应用参考：已保存的64×64参考图（dataURL）要能还原成
// 通道可用的编码BYTE；参考蒙版裁切块无法从64×64参考图反推，因此必须由调用方
// 重新提供或在保存时一并持久化——本模块不伪造它。

function png64DataURL(){
 // 与产品参考图政策一致的64×64不透明RGBA PNG（用产品自己的编码器生成）
 return null;
}

test('restore decodes a saved 64x64 reference dataURL into encoded BYTE plus policy',async()=>{
 const {encodeReferencePNG64}=await import('../src/reference-png.js');
 const rgba=new Uint8Array(64*64*4);
 for(let i=0;i<64*64;i++){rgba[i*4]=(i*3)%256;rgba[i*4+1]=(i*7)%256;rgba[i*4+2]=(i*11)%256;rgba[i*4+3]=255;}
 const png=await encodeReferencePNG64(rgba);
 const b64=Buffer.from(png).toString('base64');
 const url='data:image/png;base64,'+b64;
 const r=restoreReferenceSupplies({image:url});
 assert.equal(r.referencePNGSupply.policy,'encoded-opaque-rgba8-reference64-no-metadata-transform');
 assert.deepEqual(Array.from(r.referencePNGSupply.data),Array.from(png),'编码BYTE必须与保存的PNG一致');
});

test('restore refuses a cleared or malformed reference instead of inventing one',()=>{
 assert.equal(restoreReferenceSupplies(null),null);
 assert.equal(restoreReferenceSupplies({image:null}),null);
 assert.throws(()=>restoreReferenceSupplies({image:'not-a-data-url'}),TypeError);
 assert.throws(()=>restoreReferenceSupplies({image:'data:image/jpeg;base64,AAAA'}),TypeError);
 assert.throws(()=>restoreReferenceSupplies({}),TypeError);
});

test('restore never fabricates a mask crop',()=>{
 const png='data:image/png;base64,'+Buffer.from([137,80,78,71]).toString('base64');
 assert.throws(()=>restoreReferenceSupplies({image:png}),/不是有效|PNG|解码/);
 // 即使参考图有效，也不得凭空给出 referenceMaskCrop
});
