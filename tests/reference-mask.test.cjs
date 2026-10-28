'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let masks;try{masks=require('../inference/skin-reference/mask.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('supplied mask product matches every BYTE pair and skips independent padding',()=>{
 assert.equal(typeof masks?.multiplySuppliedMasks,'function','supplied reference mask multiplication is missing');
 const width=256,height=256,baseStride=259,selectionStride=261;
 const baseMask=new Uint8Array(baseStride*height).fill(173),selectionMask=new Uint8Array(selectionStride*height).fill(239);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){baseMask[y*baseStride+x]=y;selectionMask[y*selectionStride+x]=x;}
 const baseBefore=baseMask.slice(),selectionBefore=selectionMask.slice();
 const out=masks.multiplySuppliedMasks({baseMask,selectionMask,width,height,baseStride,selectionStride});
 assert.ok(out instanceof Uint8Array);assert.equal(out.length,65536);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)assert.equal(out[y*width+x],Math.floor((x*y+127)/255),`pair ${x},${y}`);
 assert.deepEqual(baseMask,baseBefore);assert.deepEqual(selectionMask,selectionBefore);
 out[0]=255;assert.equal(baseMask[0],0);assert.equal(selectionMask[0],0);
});

test('supplied mask product rejects incomplete or unbounded descriptors',()=>{
 assert.equal(typeof masks?.multiplySuppliedMasks,'function','supplied reference mask multiplication is missing');
 const args={baseMask:new Uint8Array([255,128,0,1]),selectionMask:new Uint8Array([255,255,255,255]),width:2,height:2,baseStride:2,selectionStride:2};
 assert.deepEqual(Array.from(masks.multiplySuppliedMasks(args)),[255,128,0,1]);
 for(const patch of [{baseMask:new Float32Array(4)},{selectionMask:new Uint8Array(3)},{baseStride:1},{selectionStride:2.5},{width:1},{height:32767},{width:32766,height:32766}])assert.throws(()=>masks.multiplySuppliedMasks({...args,...patch}));
});

test('mask patch 新whole1:独立mask单轴/双轴1仍按原边界裁剪',()=>{
 const {referenceMaskPatchROI}=require('../inference/skin-reference/mask.cjs');
 for(const maskWH of [[1,1],[1,7],[7,1]]){
  const r=referenceMaskPatchROI({ratios:[0,0],currentPhotoWH:[64,64],maskWH});
  assert.equal(r.valid,true);assert.deepEqual(Array.from(r.ROI),[0,0,...maskWH]);
 }
 assert.throws(()=>referenceMaskPatchROI({ratios:[0,0],currentPhotoWH:[1,64],maskWH:[1,1]}));
 assert.throws(()=>referenceMaskPatchROI({ratios:[0,0],currentPhotoWH:[64,64],maskWH:[0,1]}));
});
