'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {referenceMaskPatchROI}=require('../inference/skin-reference/mask.cjs');

test('reference mask alone uses ratio centre minus32 and at most64 extent',()=>{
 assert.equal(typeof referenceMaskPatchROI,'function','reference mask patch geometry is missing');
 const args={currentPhotoWH:[600,200],maskWH:[600,200],ratios:[.5,.5]};
 assert.deepEqual(referenceMaskPatchROI(args),{ROI:Int32Array.from([268,68,64,64]),valid:true});
 assert.deepEqual(referenceMaskPatchROI({...args,ratios:[1,1]}),{ROI:Int32Array.from([568,168,32,32]),valid:true});
 assert.deepEqual(referenceMaskPatchROI({...args,ratios:[-1,-1]}),{ROI:Int32Array.from([0,0,64,64]),valid:true});
});

test('reference mask patch clamps against independent source mask dimensions and preserves emptiness',()=>{
 assert.equal(typeof referenceMaskPatchROI,'function','reference mask patch geometry is missing');
 const args={currentPhotoWH:[600,200],maskWH:[300,100],ratios:[.5,.5]};
 assert.deepEqual(referenceMaskPatchROI(args),{ROI:Int32Array.from([268,68,32,32]),valid:true});
 assert.deepEqual(referenceMaskPatchROI({...args,maskWH:[100,50],ratios:[1,1]}),{ROI:Int32Array.from([100,50,0,0]),valid:false});
 assert.deepEqual(referenceMaskPatchROI({...args,maskWH:[600,200],ratios:[1.5,1.5]}),{ROI:Int32Array.from([600,200,0,0]),valid:false});
 for(const patch of [{ratios:[NaN,.5]},{ratios:[1e30,.5]},{currentPhotoWH:[600.5,200]},{maskWH:[0,100]}])assert.throws(()=>referenceMaskPatchROI({...args,...patch}));
});
