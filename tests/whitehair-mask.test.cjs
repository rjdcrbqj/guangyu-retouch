const test=require('node:test'),assert=require('node:assert/strict');
const {initializeOpenCV}=require('../inference/opencv-runtime.cjs');
let prepare;
try{prepare=require('../inference/white-hair/mask.cjs').prepareWhiteHairSoftMask;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
test('去白发蒙版：36组独立OpenCV对照覆盖奇数尺寸、椭圆扩展和反射边界',async()=>{
 assert.equal(typeof prepare,'function');await initializeOpenCV();
 const fixture=require('./fixtures/whitehair-mask-opencv.json');
 assert.ok(Object.values(fixture.counterfactualDifferentBytes).every(n=>n>0));
 for(const row of fixture.cases){const data=Buffer.from(row.data,'hex'),out=prepare({...row,data});assert.deepEqual([out.width,out.height],[row.width,row.height]);assert.equal(Buffer.from(out.data).toString('hex'),row.expected,row.name);assert.equal(data.toString('hex'),row.data);}
});
test('去白发蒙版：忽略行尾填充，返回独立连续图像',async()=>{
 assert.equal(typeof prepare,'function');await initializeOpenCV();const data=Uint8Array.from([37,37,37,255,255,37,37,37,255,255]);
 const out=prepare({data,width:3,height:2,stride:5});assert.deepEqual(Array.from(out.data),Array(6).fill(37));out.data[0]=0;assert.equal(data[0],37);
});
test('去白发蒙版：拒绝空图、不完整行与非字节输入',()=>{
 assert.equal(typeof prepare,'function');const good={data:new Uint8Array(12),width:4,height:3};
 for(const patch of [{width:0},{height:1.5},{stride:3},{data:new Uint8Array(11)},{data:new Float32Array(12)}])assert.throws(()=>prepare({...good,...patch}),RangeError);
});
