const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
const fixture=require('./fixtures/hair-cached-composite-opencv.json');
let cached;
try{cached=require('../inference/hair-smooth/cached-composite.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

// 缓存位置、行距、四张图层或粘贴位置接错，都会改变独立生成的期望像素。
test('头发缓存合成：32组不同缓存尺寸和位置符合独立逐像素对照',async()=>{
 assert.equal(typeof cached?.composeCachedHairRegion,'function');
 await initializeOpenCV();
 for(const row of fixture.cases){
  const layers=Object.fromEntries(Object.entries(row.layers).map(([name,layer])=>[name,{...layer,data:Buffer.from(layer.data,'hex')}]));
  const image=Buffer.from(row.image,'hex');
  const output=cached.composeCachedHairRegion({...row,image,layers});
  assert.equal(Buffer.from(output).toString('hex'),row.expected,row.name);
  assert.equal(image.toString('hex'),row.image,row.name+' 源图不得修改');
  for(const [name,layer] of Object.entries(layers))assert.equal(layer.data.toString('hex'),row.layers[name].data,row.name+' '+name);
 }
});

test('头发缓存合成：拒绝缺失图层、不完整缓存和越界目标',async()=>{
 assert.equal(typeof cached?.composeCachedHairRegion,'function');
 await initializeOpenCV();
 const row=fixture.cases[0];
 const input={...row,image:Buffer.from(row.image,'hex'),layers:Object.fromEntries(Object.entries(row.layers).map(([name,layer])=>[name,{...layer,data:Buffer.from(layer.data,'hex')}]))};
 assert.throws(()=>cached.composeCachedHairRegion({...input,layers:{...input.layers,alpha:undefined}}),/alpha/);
 assert.throws(()=>cached.composeCachedHairRegion({...input,layers:{...input.layers,mask:{...input.layers.mask,data:new Uint8Array(0)}}}),RangeError);
 assert.throws(()=>cached.composeCachedHairRegion({...input,rect:[-1,0,2,2]}),RangeError);
 assert.throws(()=>cached.composeCachedHairRegion({...input,rect:[0,0,1000,1000]}),RangeError);
});
