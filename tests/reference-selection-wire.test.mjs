import test from 'node:test';import assert from 'node:assert/strict';
import {buildReferenceJobRequest} from '../src/reference-job.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import zlib from 'node:zlib';

const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,d){const body=Buffer.concat([Buffer.from(t),d]);const o=Buffer.alloc(d.length+12);
 o.writeUInt32BE(d.length);body.copy(o,4);o.writeUInt32BE(crc32(body),o.length-4);return o;}
function png64(){const raw=Buffer.alloc(64*257);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)raw.set([30,60,90,255],y*257+1+x*4);
 const ih=Buffer.alloc(13);ih.writeUInt32BE(64);ih.writeUInt32BE(64,4);ih[8]=8;ih[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
function supplies(over={}){
 const W=64,H=64;
 const rgba=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++)rgba.set([10,20,30,255],i*4);
 const mask=new Uint8Array(W*H).fill(255);
 return {originalPixels:rgba,originalWidth:W,originalHeight:H,
  workingPhoto:{data:new Uint8Array(W*H*3).fill(50),width:W,height:H,stride:W*3,format:301},
  referencePNG:{data:png64(),policy:POLICY},
  referenceMask:{data:new Uint8Array(4096).fill(255),width:64,height:64,stride:64},
  blendMask:{data:mask,width:W,height:H,stride:W},
  secondaryTestMask:null,intensity:1,referenceRevision:1,...over};
}
// 手动路线：currentMask（BYTE1）
function manual(){return supplies({currentMask:{data:new Uint8Array(64*64).fill(255),width:64,height:64,stride:64}});}
// typed路线：selectionSupply+baseMask
function typed(){
 const selection={instanceMasks:[],typedMasks:new Map(),faceOrdinals:[]};
 const base={data:new Uint8Array(64*64).fill(200),width:64,height:64,stride:64};
 return supplies({selectionSupply:selection,baseMask:base});
}

test('manual route (currentMask) -> temporaryMask',()=>{
 const r=buildReferenceJobRequest(manual());
 assert.equal(r.temporaryMask.width,64);
 assert.equal('selectionSupply' in r,false);
});

test('typed route (selectionSupply+baseMask) -> passed through, no temporaryMask',()=>{
 const r=buildReferenceJobRequest(typed());
 assert.equal('temporaryMask' in r,false);
 assert.equal(r.baseMask.data[0],200);
});

test('both routes at once is rejected',()=>{
 const selection={instanceMasks:[],typedMasks:new Map(),faceOrdinals:[]};
 const base={data:new Uint8Array(64*64).fill(200),width:64,height:64,stride:64};
 assert.throws(()=>buildReferenceJobRequest(supplies({currentMask:{data:new Uint8Array(64*64).fill(255),width:64,height:64,stride:64},selectionSupply:selection,baseMask:base})),/冲突|路线|route|互斥/);
});

test('neither route is rejected',()=>{
 assert.throws(()=>buildReferenceJobRequest(supplies()),/currentMask|selectionSupply/);
});
