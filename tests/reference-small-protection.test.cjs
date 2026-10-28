'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let protection;try{protection=require('../inference/skin-reference/small-protection.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}

test('small protection keeps original radius clamp and two BYTE divisions with padded input',()=>{
 assert.equal(typeof protection?.blurSmallSuppliedProtection,'function','small protection adapter is missing');
 const data=new Uint8Array(14*11);for(let y=0;y<11;y++)data.fill(231,y*14+11,(y+1)*14);data[5*14+5]=255;
 const before=data.slice(),out=protection.blurSmallSuppliedProtection({data,width:11,height:11,stride:14});
 assert.equal(out.effectiveRadius,2);assert.equal(out.mask.length,121);
 const expected=new Uint8Array(121),rows=[[3,6,9,6,3],[6,12,18,12,6],[9,18,28,18,9],[6,12,18,12,6],[3,6,9,6,3]];
 for(let y=0;y<5;y++)expected.set(rows[y],(y+3)*11+3);
 assert.deepEqual(out.mask,expected);assert.deepEqual(data,before);out.mask[0]=255;assert.equal(data[0],0);
});

test('small protection accepts512 edge and rejects unresolved larger resize branch',()=>{
 assert.equal(typeof protection?.blurSmallSuppliedProtection,'function','small protection adapter is missing');
 const args={data:new Uint8Array(512*11).fill(177),width:512,height:11,stride:512};
 const out=protection.blurSmallSuppliedProtection(args);assert.equal(out.effectiveRadius,2);assert.ok(out.mask.every(v=>v===177));
 for(const patch of [{width:513,stride:513,data:new Uint8Array(513*11)},{height:513,data:new Uint8Array(512*513)},{width:10},{stride:511},{data:new Uint8Array(512*11-1)},{data:new Float32Array(512*11)}])assert.throws(()=>protection.blurSmallSuppliedProtection({...args,...patch}));
});

test('small protection distinguishes intermediate BYTE division from a single 2D division',()=>{
 const data=new Uint8Array(121);data[5*11+5]=21;
 const out=protection.blurSmallSuppliedProtection({data,width:11,height:11,stride:11});
 const expected=new Uint8Array(121);expected[5*11+5]=2;
 for(const [x,y] of [[5,4],[4,5],[6,5],[5,6]])expected[y*11+x]=1;
 assert.deepEqual(out.mask,expected);assert.equal(out.mask[4*11+4],0,'one-step 2D division would produce1');
});
