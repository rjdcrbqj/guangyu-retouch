import test from 'node:test';import assert from 'node:assert/strict';
import {makeWorkingPixelsReader} from '../src/reference-memory.js';

// 每张照片不再长期驻留一份工作分辨率RGBA（约6.5MB）；按需读取，用完即可回收。
// 这里用假 document/canvas 验证尺寸映射与"每次都是独立副本"。

function fakeDoc(){
 let reads=0;
 const doc={createElement(){
  const c={width:0,height:0,getContext(){
   return {drawImage(){},getImageData(x,y,w,h){
    reads++;
    const d=new Uint8ClampedArray(w*h*4);
    for(let i=0;i<w*h;i++){d[i*4]=i%256;d[i*4+3]=255;}
    return {data:d};
   }};
  }};
  return c;
 }};
 return {doc,getReads:()=>reads};
}

test('reads at the 1600 working cap without retaining per-photo state',()=>{
 const {doc}=fakeDoc();
 const read=makeWorkingPixelsReader(doc);
 const img={naturalWidth:4000,naturalHeight:3000};
 const a=read(img);
 assert.equal(a.width,1600);
 assert.equal(a.height,1200);
 assert.equal(a.data.length,1600*1200*4);
 // 再次读取应得到独立副本（不是同一引用）
 const b=read(img);
 assert.notEqual(a.data,b.data,'每次读取必须是独立缓冲区');
});

test('small images are not upscaled',()=>{
 const {doc}=fakeDoc();
 const read=makeWorkingPixelsReader(doc);
 const r=read({naturalWidth:800,naturalHeight:600});
 assert.equal(r.width,800);assert.equal(r.height,600);
});

test('portrait orientation maps the long edge to 1600',()=>{
 const {doc}=fakeDoc();
 const read=makeWorkingPixelsReader(doc);
 const r=read({naturalWidth:2000,naturalHeight:4000});
 assert.equal(r.height,1600);
 assert.equal(r.width,800);
});
