const test=require('node:test'),assert=require('node:assert/strict');
let bounds,eligible;try{({choosePreparedToothQualityRect:bounds,isPreparedToothRepairEligible:eligible}=require('../inference/tooth-repair/eligibility.cjs'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('牙齿质量区域：全组关键点边界、非对称扩展、float32截断及图像裁剪',()=>{
 assert.equal(typeof bounds,'function');const f=require('./fixtures/tooth-quality-rect-static.json');assert.ok(f.doubleDifferentCases>0);for(const row of f.cases){const landmarks=new Float32Array(row.landmarks),before=landmarks.slice();assert.deepEqual(bounds({...row,landmarks}),row.expected,row.name);assert.deepEqual(landmarks,before);}
});
test('牙齿处理资格：原默认张开距离20、质量区域200、清晰度1.7的包含边界',()=>{
 assert.equal(typeof eligible,'function');const landmarks=new Float32Array(214);landmarks.set([100,100],98*2);landmarks.set([100,120],104*2);const input={alignedLandmarks:landmarks,qualityRect:[0,0,200,200],detailScore:Math.fround(1.7)};
 assert.equal(eligible(input),true);assert.equal(eligible({...input,detailScore:Math.fround(1.7)-.000001}),false);assert.equal(eligible({...input,qualityRect:[0,0,199,200]}),false);assert.equal(eligible({...input,qualityRect:[0,0,200,199]}),false);
 const closed=landmarks.slice();closed[104*2+1]=119.99999;assert.equal(eligible({...input,alignedLandmarks:closed}),false);assert.equal(eligible({...input,checkQuality:false,detailScore:undefined}),true);assert.equal(eligible({bypass:true}),true);
});
test('牙齿处理资格：拒绝异常关键点、阈值与区域',()=>{
 assert.equal(typeof eligible,'function');const alignedLandmarks=new Float32Array(214);alignedLandmarks[104*2+1]=30;const input={alignedLandmarks,qualityRect:[0,0,200,200],detailScore:2};
 for(const patch of [{alignedLandmarks:new Float32Array(208)},{alignedLandmarks:new Float32Array(214).fill(NaN)},{minimumOpening:NaN},{minimumRegionSize:-1},{detailScore:NaN},{qualityRect:[0,0,-1,200]}])assert.throws(()=>eligible({...input,...patch}),RangeError);
 assert.throws(()=>bounds({landmarks:new Float32Array([NaN,0]),width:640,height:480}),RangeError);
});
