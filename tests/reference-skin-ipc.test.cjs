'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSkinReferenceHandler}=require('../inference/skin-reference/ipc.cjs');
const {readFileSync}=require('node:fs');

// 仅测试通道：注入假处理器，不加载ONNX、不运行NN、不打开原版。
function fakeProcessor(){
 const calls=[];
 return {calls,run(r){calls.push(r);return Promise.resolve({ok:true,referenceRevision:r.referenceRevision});},
  close(){return Promise.resolve();}};
}
function request(){
 return {original:{data:new Uint8Array(17*13*4).fill(7),width:17,height:13,stride:68,channels:4},
  workingPhoto:{data:new Uint8Array(17*13*3).fill(9),width:17,height:13,stride:51,format:301},
  geometry:{valid:true,originalROI:Int32Array.from([1,2,8,6]),inputForward:Float32Array.from([1,0,0,0,1,0]),postAffine:Float32Array.from([1,0,0,0,1,0])},
  blendMask:new Uint8Array(48).fill(255),blendMaskStride:8,secondaryTestMask:new Uint8Array(48).fill(1),secondaryTestMaskStride:8,
  intensity:.5,referenceRevision:9,
  referenceMask:{data:new Uint8Array(4096).fill(3),width:64,height:64,stride:64}};
}

test('channel forwards a complete explicit supply to the existing processor entry',async()=>{
 const p=fakeProcessor(),h=createSkinReferenceHandler({processor:p});
 const r=request(),out=await h({},r);
 assert.equal(p.calls.length,1);assert.equal(out.ok,true);assert.equal(out.referenceRevision,9);
 assert.equal(p.calls[0].intensity,.5);
 assert.equal(p.calls[0].referenceMask.data.length,4096);
});

test('channel rejects an encoded image string even when a full layout is supplied',async()=>{
 const p=fakeProcessor(),h=createSkinReferenceHandler({processor:p});
 const r=request();
 // 真实PNG字节（含文件头）经base64成为dataURL字符串——编码字节不是像素。
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40,7)]);
 const url='data:image/png;base64,'+png.toString('base64');
 // 即使把布局字段全部补齐，也必须拒绝：本通道不解码、不做魔数猜测。
 const withLayout={...r,original:url,originalWidth:17,originalHeight:13,originalStride:68,originalChannels:4};
 await assert.rejects(h({},withLayout),/需要已解码原始像素帧/);
 assert.equal(p.calls.length,0,'拒绝编码字符串时不得调用处理器');
 // 裸dataURL（无布局）同样拒绝。
 await assert.rejects(h({}, {...r,original:url}),/需要已解码原始像素帧/);
 // 其他字符串形式也拒绝。
 await assert.rejects(h({}, {...r,original:'raw-bytes'}),/需要已解码原始像素帧/);
 assert.equal(p.calls.length,0);
});

test('channel rejects a missing reference mask instead of inventing a default',async()=>{
 const p=fakeProcessor(),h=createSkinReferenceHandler({processor:p});
 const r=request();delete r.referenceMask;
 await assert.rejects(h({},r),/referenceMask/);
 assert.equal(p.calls.length,0,'不得在缺蒙版时调用处理器');
});

test('channel reports each missing required supply by name and never calls the processor',async()=>{
 const p=fakeProcessor(),h=createSkinReferenceHandler({processor:p});
 for(const key of ['workingPhoto','geometry','blendMask','secondaryTestMask','intensity','referenceRevision','original']){
  const r=request();delete r[key];
  await assert.rejects(h({},r),new RegExp(key));
 }
 assert.equal(p.calls.length,0);
 await assert.rejects(h({},null),TypeError);
 await assert.rejects(h({},[]),TypeError);
});

test('channel surfaces the processor failure unchanged',async()=>{
 const boom=new Error('后端失败：真实原因');
 const h=createSkinReferenceHandler({processor:{run(){return Promise.reject(boom);},close(){}}});
 await assert.rejects(h({},request()),/后端失败：真实原因/);
});

test('main and preload actually expose the skin-reference channel',()=>{
 const main=readFileSync(require('node:path').join(__dirname,'..','main.cjs'),'utf8');
 const preload=readFileSync(require('node:path').join(__dirname,'..','preload.cjs'),'utf8');
 assert.match(main,/ipcMain\.handle\('skin-reference'/);
 assert.match(main,/inference\/skin-reference\/processor\.cjs/);
 assert.match(main,/skinReferenceProcessor\?\.close\(\)/);
 assert.match(preload,/skinReference:payload=>ipcRenderer\.invoke\('skin-reference'/);
});
