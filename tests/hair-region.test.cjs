const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/hair-bounds.json');
const externalFixture=require('./fixtures/hair-external-opencv.json');
let region;
try{region=require('../inference/hair-smooth/region.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('头发外轮廓：256组合成蒙版面积符合独立OpenCV对照',()=>{
 assert.equal(typeof region?.findPreparedHairContours,'function');
 for(const row of externalFixture.cases){
  const data=Buffer.from(row.data,'hex');
  const contours=region.findPreparedHairContours({...row,data});
  const areas=region.selectPreparedHairContours(contours).areas.sort((a,b)=>a-b);
  assert.deepEqual(areas,row.areas,row.name);assert.equal(data.toString('hex'),row.data);
 }
});

test('头发区域：128组原边界扫描输出一致，包括小宽度的对齐行为',()=>{
 assert.equal(typeof region?.scanPreparedHairBounds,'function');
 for(const row of fixture.cases){
  const data=Buffer.from(row.data,'hex');
  const rect=region.scanPreparedHairBounds({...row,data,alignment:row.offset});
  assert.deepEqual(rect,row.originalRect,row.name);assert.equal(data.toString('hex'),row.data);
 }
});

test('头发区域：二值化严格大于50，忽略输入行尾填充',()=>{
 assert.equal(typeof region?.thresholdPreparedHairMask,'function');
 const data=Uint8Array.from([0,49,50,255,51,254,255,255]);
 assert.deepEqual(Array.from(region.thresholdPreparedHairMask({data,width:3,height:2,stride:4})),[0,0,0,255,255,255]);
 assert.deepEqual(Array.from(data),[0,49,50,255,51,254,255,255]);
});

test('头发区域：按轮廓面积的5%严格过滤，保留原输入次序',()=>{
 assert.equal(typeof region?.selectPreparedHairContours,'function');
 const contours=[[[0,0],[20,0],[20,10],[0,10]],[[30,0],[40,0],[40,1],[30,1]],[[30,0],[41,0],[41,1],[30,1]],[[90,90]]];
 assert.deepEqual(region.selectPreparedHairContours(contours),{areas:[200,10,11,0],threshold:10,selected:[0,2]});
 const half=[[[0,0],[3,0],[0,3]],[[8,8],[9,8],[8,9]]];
 assert.deepEqual(region.selectPreparedHairContours(half),{areas:[4.5,.5],threshold:.2,selected:[0,1]});
});

test('头发区域：128组合成外轮廓的面积与筛选结果符合独立OpenCV对照',()=>{
 const cases=require('./fixtures/hair-contours-opencv.json').cases;
 for(const row of cases)assert.deepEqual(region.selectPreparedHairContours(row.contours),{areas:row.areas,threshold:row.threshold,selected:row.selected},row.name);
});

test('头发区域：外扩按宽度20%计算，保留原右下越界供后续裁切',()=>{
 assert.equal(typeof region?.expandPreparedHairBounds,'function');
 assert.deepEqual(region.expandPreparedHairBounds({bounds:[2,3,20,10],canvasWH:[100,80]}),[0,0,26,17]);
 assert.deepEqual(region.expandPreparedHairBounds({bounds:[95,75,5,5],canvasWH:[100,80]}),[94,74,7,7]);
 assert.deepEqual(region.expandPreparedHairBounds({bounds:[40,30,10,10],hintRect:[30,25,10,5],canvasWH:[100,80]}),[26,21,28,23]);
});

test('头发区域：空区域、单点轮廓和不足输入不产生伪选区',()=>{
 assert.equal(typeof region?.scanPreparedHairBounds,'function');
 assert.deepEqual(region.selectPreparedHairContours([]),{areas:[],threshold:0,selected:[]});
 assert.deepEqual(region.expandPreparedHairBounds({bounds:[0,0,0,0],canvasWH:[10,10]}),[0,0,0,0]);
 assert.throws(()=>region.scanPreparedHairBounds({data:new Uint8Array(1),width:2,height:2,stride:2}),RangeError);
});

test('头发补边：灰度结果放回原画布位置，画布其余位置为零',()=>{
 assert.equal(typeof region?.alignPreparedHairPlane,'function');
 const data=Uint8Array.from([1,2,99,3,4,99]);
 const output=region.alignPreparedHairPlane({data,width:2,height:2,stride:3,channels:1,rect:[1,2,2,2],canvasWH:[5,5]});
 assert.deepEqual([output.width,output.height,output.stride],[5,5,5]);
 assert.deepEqual(Array.from(output.data),[0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,3,4,0,0,0,0,0,0,0]);
 assert.deepEqual(Array.from(data),[1,2,99,3,4,99]);
});

test('头发补边：RGB结果按像素放置，无需补边时共享原图层',()=>{
 assert.equal(typeof region?.alignPreparedHairPlane,'function');
 const data=Uint8Array.from([1,2,3,4,5,6]);
 const input={data,width:2,height:1,stride:6,channels:3,rect:[0,0,2,1],canvasWH:[2,1]};
 assert.equal(region.alignPreparedHairPlane(input).data,data);
 assert.equal(region.alignPreparedHairPlane({...input,canvasWH:[0,0]}).data,data);
 const output=region.alignPreparedHairPlane({...input,rect:[1,0,2,1],canvasWH:[4,2]});
 assert.deepEqual(Array.from(output.data),[0,0,0,1,2,3,4,5,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
});

test('头发补边：拒绝缓存矩形与实际图层不匹配以及画布越界',()=>{
 assert.equal(typeof region?.alignPreparedHairPlane,'function');
 const input={data:new Uint8Array(4),width:2,height:2,channels:1,rect:[0,0,2,2],canvasWH:[4,4]};
 assert.throws(()=>region.alignPreparedHairPlane({...input,rect:[0,0,3,2]}),RangeError);
 assert.throws(()=>region.alignPreparedHairPlane({...input,rect:[3,3,2,2]}),RangeError);
});

test('头发裁切：外扩区域与画布相交，完全在外或退化时清空',()=>{
 assert.equal(typeof region?.clipPreparedHairRect,'function');
 for(const [rect,expected] of [
  [[94,74,7,7],[94,74,6,6]],[[ -2,-3,8,10],[0,0,6,7]],
  [[-200,-200,400,400],[0,0,100,80]],[[100,10,5,5],[0,0,0,0]],
  [[-10,10,5,5],[0,0,0,0]],[[10,80,5,5],[0,0,0,0]],
  [[20,20,0,5],[0,0,0,0]],[[20,20,5,5],[20,20,5,5]]
 ])assert.deepEqual(region.clipPreparedHairRect({rect,canvasWH:[100,80]}),expected);
});

test('头发区域：筛除小轮廓后计算边界，合并提示框并外扩',()=>{
 assert.equal(typeof region?.prepareHairContourRegion,'function');
 const contours=[[[2,2],[12,2],[12,12],[2,12]],[[25,25],[26,25],[26,26],[25,26]]];
 const result=region.prepareHairContourRegion({contours,canvasWH:[40,40],hintRect:[0,0,3,3]});
 assert.deepEqual(result,{areas:[100,1],threshold:5,selected:[0],bounds:[2,2,11,11],expanded:[0,0,15,15]});
});

test('头发区域：无有效轮廓时允许使用提示框，输入点列保持不变',()=>{
 assert.equal(typeof region?.prepareHairContourRegion,'function');
 const contours=[[[1,1]]],before=JSON.stringify(contours);
 assert.deepEqual(region.prepareHairContourRegion({contours,canvasWH:[20,20],hintRect:[5,5,5,5]}),{areas:[0],threshold:0,selected:[],bounds:[0,0,0,0],expanded:[4,4,7,7]});
 assert.equal(JSON.stringify(contours),before);
});

test('头发蒙版区域：二值化后提取外轮廓，滤除小区域并计算边界',()=>{
 assert.equal(typeof region?.prepareHairMaskRegion,'function');
 const width=20,height=14,data=new Uint8Array(width*height);
 for(let y=2;y<=10;y++)for(let x=2;x<=12;x++)data[y*width+x]=100;
 data[1*width+18]=50;data[12*width+18]=255;
 const output=region.prepareHairMaskRegion({data,width,height});
 assert.deepEqual(output.bounds,[2,2,11,9]);assert.deepEqual(output.expanded,[0,0,15,13]);
 assert.equal(data[1*width+18],50);assert.equal(data[12*width+18],255);
});

test('头发蒙版区域：先填充选定轮廓，再遵循原窄行边界扫描',()=>{
 const data=Uint8Array.from([0,0,0,0,0,0,255,0,0,255,255,255]);
 const output=region.prepareHairMaskRegion({data,width:3,height:4});
 assert.deepEqual(output.bounds,[0,2,1,2]);
});

test('头发蒙版区域：329组合成图的填充像素和边界符合独立对照',()=>{
 const rows=require('./fixtures/hair-region-fill-opencv.json').cases;
 for(const row of rows){
  const data=Buffer.from(row.data,'hex');
  const output=region.prepareHairMaskRegion({...row,data});
  assert.ok(output.selectedMask instanceof Uint8Array,row.name+' 缺少筛选后蒙版');
  assert.equal(Buffer.from(output.selectedMask).toString('hex'),row.filled,row.name+' 填充像素');
  assert.deepEqual(output.areas.toSorted((a,b)=>a-b),row.areas,row.name+' 面积');
  assert.equal(output.threshold,row.threshold,row.name+' 面积阈值');
  assert.deepEqual(output.bounds,row.bounds,row.name+' 边界');
  assert.equal(data.toString('hex'),row.data,row.name+' 原柔边蒙版不得改变');
 }
});

test('头发蒙版区域：1024×768的孔洞、碎片和密集图仍保持正确像素',()=>{
 const {inflateSync}=require('node:zlib'),{createHash}=require('node:crypto');
 for(const row of require('./fixtures/hair-region-large-opencv.json').cases){
  const data=inflateSync(Buffer.from(row.dataDeflate,'base64'));
  const output=region.prepareHairMaskRegion({...row,data});
  assert.equal(createHash('sha256').update(output.selectedMask).digest('hex'),row.filledSha256,row.name+' 填充像素');
  assert.deepEqual(output.bounds,row.bounds,row.name+' 边界');
  assert.equal(output.areas.length,row.contours,row.name+' 轮廓数量');
  assert.equal(output.selected.length,row.selected,row.name+' 有效区域数量');
 }
});
