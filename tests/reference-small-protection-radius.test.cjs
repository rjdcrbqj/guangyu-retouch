'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {blurSmallSuppliedProtection}=require('../inference/skin-reference/small-protection.cjs');
test('二次保护明确请求radius30，阶跃边界按31平方分母而非旧radius20模糊',()=>{
 const width=128,height=124,stride=131,data=new Uint8Array(stride*height).fill(171);
 for(let y=0;y<height;y++){data.fill(0,y*stride,y*stride+64);data.fill(255,y*stride+64,y*stride+width);}
 const before=data.slice(),out=blurSmallSuppliedProtection({data,width,height,stride,requestedRadius:30});
 assert.equal(out.effectiveRadius,30);assert.equal(out.mask[62*width+63],123);assert.equal(out.mask[62*width+64],131);
 assert.equal(out.mask[62*width],0);assert.equal(out.mask[62*width+127],255);assert.deepEqual(data,before);
 // 各行相同，第二遍整数三角核保持第一遍；两个边界值是手算465/496个权重除以961。
 for(let y=0;y<height;y++)assert.deepEqual(out.mask.subarray(y*width,(y+1)*width),out.mask.subarray(0,width));
});
test('显式radius仍按短边限幅，非法请求拒绝，不把未知值默认为20',()=>{
 const r={data:new Uint8Array(31*29).fill(137),width:31,height:29,stride:31};
 const out=blurSmallSuppliedProtection({...r,requestedRadius:30});assert.equal(out.effectiveRadius,6);assert.ok(out.mask.every(v=>v===137));
 for(const requestedRadius of [0,-1,65,1.5,null,NaN])assert.throws(()=>blurSmallSuppliedProtection({...r,requestedRadius}));
});
