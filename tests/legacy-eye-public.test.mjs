import test from 'node:test';
import assert from 'node:assert/strict';
import * as adapter from '../src/public-bright-eye-cache.js';
// 人工构造的旧工程网格，不依赖恢复的模板、贴图或执行程序。
export function legacyFace(closed=false){
 const values=[30,20];for(let i=0;i<24;i++){const a=i*Math.PI/12;values.push(30+12*Math.cos(a),20+5*Math.sin(a));}values.push(...values.slice(2));
 return {format:'guangyu-bright-eye-face',version:1,sourceWH:[96,64],sides:[{side:0,closed,ROI:[14,10,32,20],worldBits:Array(280).fill(0),pupilBits:Array.from(new Uint32Array(new Float32Array(values).buffer)),highlightBase64:Buffer.alloc(40000,255).toString('base64')}]};
}
test('旧工程眼环转换为公开分区，保留位置、侧别、软边和原缓存',()=>{
 assert.equal(typeof adapter.publicFacesFromLegacy,'function','需要独立旧缓存适配器');
 const face=legacyFace(),before=structuredClone(face),converted=adapter.publicFacesFromLegacy([face]);assert.deepEqual(face,before);assert.equal(converted[0].format,'guangyu-public-bright-eye-face');
 const side=converted[0].sides[0],bytes=Buffer.from(side.rgbaBase64,'base64'),at=(x,y)=>Array.from(bytes.subarray(((y-10)*32+x-14)*4,((y-10)*32+x-14)*4+4));assert.equal(side.side,0);assert.deepEqual(side.roi,[14,10,32,20]);
 assert.ok(at(30,20)[1]>200,'瞳孔');assert.ok(at(21,20)[0]>200,'眼白');assert.equal(at(15,11)[0],0);assert.equal(at(15,11)[1],0);
 assert.ok(Array.from(bytes).some(v=>v>0&&v<255),'软边');assert.equal(adapter.publicFacesFromLegacy([legacyFace(true)])[0].sides.length,0);
 assert.deepEqual(adapter.publicFacesFromLegacy(converted),converted);
});
test('旧 v2 亮眼投影保护保留全零、半强度及非中心软边',()=>{
 const bits=v=>Array.from(new Uint32Array(new Float32Array(v).buffer));
 const withPlane=value=>{const face=legacyFace();face.version=2;face.extra={plane3Base64:Buffer.alloc(65536,value).toString('base64'),projectionBits:bits([3,0,0,0,3.2,0,-14/32,-.5,1]),normalizedBits:bits([1,0,0,0,1,0,0,0,1])};return face;};
 const data=face=>Buffer.from(adapter.publicFacesFromLegacy([face])[0].sides[0].rgbaBase64,'base64'),zero=data(withPlane(0)),full=data(withPlane(255)),half=data(withPlane(128));
 assert.equal(zero.filter((v,i)=>i%4!==3&&v>0).length,0,'全零额外保护不可产生效果');
 for(let i=0;i<full.length;i++)if(i%4!==3)assert.ok(Math.abs(half[i]-full[i]*128/255)<=1);
 const face=withPlane(0),plane=Buffer.alloc(65536);for(let y=0;y<256;y++)for(let x=0;x<128;x++)plane[y*256+x]=255;face.extra.plane3Base64=plane.toString('base64');const split=data(face),at=(x,y)=>Array.from(split.subarray(((y-10)*32+x-14)*4,((y-10)*32+x-14)*4+3));
 assert.ok(at(21,20).some(v=>v>100));assert.deepEqual(at(36,20),[0,0,0]);assert.deepEqual(at(21,12),[0,0,0]);
});
