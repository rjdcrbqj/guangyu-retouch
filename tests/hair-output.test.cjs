const test=require('node:test'),assert=require('node:assert/strict');
let decode;
try{decode=require('../inference/hair-smooth/output.cjs').decodePreparedHairOutput;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('头发输出：四个CHW平面还原为RGB与透明度，保留模型输出',()=>{
 assert.equal(typeof decode,'function');
 const data=Float32Array.from([-1,1,0,.5,1,-.5,0,1]);
 const result=decode({data,dims:[1,4,1,2],kind:'base'});
 assert.deepEqual(Array.from(result.smooth),[0,128,255,255,191,64]);
 assert.deepEqual(Array.from(result.alpha),[128,255]);
 assert.deepEqual(Array.from(data),[-1,1,0,.5,1,-.5,0,1]);
});

test('头发输出：细节路径只消费两通道输出的第一平面',()=>{
 assert.equal(typeof decode,'function');
 const result=decode({data:Float32Array.from([0,-1,1,-1,1,0]),dims:[1,2,1,3],kind:'detail'});
 assert.deepEqual(Object.keys(result),['detail']);assert.deepEqual(Array.from(result.detail),[128,0,255]);
});

test('头发输出：精确半整数按照默认MXCSR向偶数取整',()=>{
 assert.equal(typeof decode,'function');
 // 使用Float32可表示的半整数边界输入。
 const data=Float32Array.from([-0.4941176474094391,0.007843137718737125,0,0,0,0]);
 const result=decode({data,dims:[1,2,1,3],kind:'detail'});
 assert.deepEqual(Array.from(result.detail),[64,128,128]);
});

test('头发输出：拒绝通道数、存储类型与尺寸不符合约定的输出',()=>{
 assert.equal(typeof decode,'function');
 assert.throws(()=>decode({data:new Float32Array(4),dims:[1,2,1,2],kind:'base'}),RangeError);
 assert.throws(()=>decode({data:new Float64Array(4),dims:[1,4,1,1],kind:'base'}),TypeError);
 assert.throws(()=>decode({data:new Float32Array(3),dims:[1,4,1,1],kind:'base'}),RangeError);
});

test('头发输出：浮点边界轻微越过正负1时按原字节转换饱和',()=>{
 assert.equal(typeof decode,'function');
 const result=decode({data:Float32Array.from([1.0000001192092896,-1.0000001192092896,1.1,-1.1,0,0,0,0]),dims:[1,2,1,4],kind:'detail'});
 assert.deepEqual(Array.from(result.detail),[255,0,255,0]);
});
