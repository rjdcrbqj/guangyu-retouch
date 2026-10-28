'use strict';
const F=Math.fround;

// 从已二值化蒙版跟踪外轮廓；候选实现经合成蒙版对照，尚未证明整条原版流程一致。
function findPreparedHairContours(input){
 const {data,width,height,stride}=layout(input);
 if(!width||!height)return [];
 const W=width+2,H=height+2,total=W*H;
 if(!Number.isSafeInteger(total)||total>0x7fffffff)throw new RangeError('头发轮廓画布过大');
 const pixels=new Uint8Array(total),outside=new Uint8Array(total),seen=new Uint8Array(total),queue=new Int32Array(total);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels[(y+1)*W+x+1]=data[y*stride+x]?1:0;
 const dx=[1,1,0,-1,-1,-1,0,1],dy=[0,1,1,1,0,-1,-1,-1],four=[0,2,4,6];
 let begin=0,end=1;outside[0]=1;queue[0]=0;
 while(begin<end){
  const p=queue[begin++],x=p%W,y=Math.floor(p/W);
  for(const d of four){const nx=x+dx[d],ny=y+dy[d],n=ny*W+nx;if(nx>=0&&nx<W&&ny>=0&&ny<H&&!pixels[n]&&!outside[n]){outside[n]=1;queue[end++]=n;}}
 }
 const contours=[];
 for(let y=1;y<=height;y++)for(let x=1;x<=width;x++){
  const start=y*W+x;if(!pixels[start]||seen[start])continue;
  begin=0;end=1;queue[0]=start;seen[start]=1;let external=false;
  while(begin<end){
   const p=queue[begin++];for(const d of four)if(outside[p+dy[d]*W+dx[d]])external=true;
   for(let d=0;d<8;d++){const n=p+dy[d]*W+dx[d];if(pixels[n]&&!seen[n]){seen[n]=1;queue[end++]=n;}}
  }
  if(!external)continue;
  let current=start,back=start-1,first=-1;const points=[];
  for(let steps=0;steps<=width*height*16;steps++){
   points.push([current%W-1,Math.floor(current/W)-1]);
   let k=-1;for(let d=0;d<8;d++)if(current+dy[d]*W+dx[d]===back){k=d;break;}
   if(k<0)throw Error('头发轮廓跟踪状态无效');
   let found=-1,j=0;for(let step=1;step<=8;step++){j=(k+step)%8;const n=current+dy[j]*W+dx[j];if(pixels[n]){found=n;break;}}
   if(found<0){contours.push(points);break;}
   if(first<0)first=found;else if(current===start&&found===first){points.pop();contours.push(points);break;}
   const prev=(j+7)%8;back=current+dy[prev]*W+dx[prev];current=found;
   if(steps===width*height*16)throw Error('头发轮廓未闭合');
  }
 }
 return contours;
}

// 验证已供应的单通道蒙版；不推断头发分割、选区映射或模型尺寸。
function layout({data,width,height,stride=width}){
 if(!(data instanceof Uint8Array)||![width,height,stride].every(v=>Number.isSafeInteger(v)&&v>=0)||stride<width||!Number.isSafeInteger(width*height)||data.length<(width&&height?(height-1)*stride+width:0))throw new RangeError('头发蒙版尺寸、行距或长度无效');
 return {data,width,height,stride};
}

// 原BYTE1边界扫描；alignment表示原数据指针模4，连续新分配图层通常为0。
function scanPreparedHairBounds(input){
 const {data,width,height,stride}=layout(input),alignment=input.alignment??0;
 if(!Number.isInteger(alignment)||alignment<0||alignment>3)throw new RangeError('头发蒙版对齐值须为0至3');
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++){
  const prefix=(4-(alignment+y*stride)%4)%4;
  for(let x=0;x<width;x++)if(data[y*stride+x]){
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=y;
   if(width<=prefix)break; // 保留原短行对齐前缀只扫描至首个非零值的行为。
  }
 }
 return right<0?[0,0,0,0]:[left,top,right-left+1,bottom-top+1];
}

// 原二值阈值为50，阈值本身归零；原柔边蒙版保持独立。
function thresholdPreparedHairMask(input){
 const {data,width,height,stride}=layout(input),output=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)output[y*width+x]=data[y*stride+x]>50?255:0;
 return output;
}

// 按原面积规则筛选轮廓；不依赖轮廓方向或起始点。
function selectPreparedHairContours(contours){
 if(!Array.isArray(contours))throw new TypeError('头发轮廓须为点列数组');
 const areas=contours.map(points=>{
  if(!Array.isArray(points)||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647)))throw new TypeError('头发轮廓须为Int32坐标点列');
  let area=0;
  if(points.length){
   let previous=points[points.length-1];
   for(const point of points){area+=point[1]*previous[0]-point[0]*previous[1];previous=point;}
  }
  return Math.abs(area*.5);
 });
 let maximum=0;
 for(const area of areas)if(maximum<area)maximum=area>=2147483648?-2147483648:Math.trunc(area);
 const threshold=maximum*.05,selected=[];
 for(let i=0;i<areas.length;i++)if(areas[i]>threshold)selected.push(i);
 return {areas,threshold,selected};
}

// 与可用提示框取并集后按宽度的20%外扩；返回原始Rect，后续映射阶段再裁切。
function expandPreparedHairBounds({bounds,canvasWH,hintRect}){
 const validRect=r=>Array.isArray(r)&&r.length===4&&r.every(v=>Number.isSafeInteger(v)&&v>=-2147483648&&v<=2147483647)&&r[2]>=0&&r[3]>=0;
 if(!validRect(bounds)||!Array.isArray(canvasWH)||canvasWH.length!==2||!canvasWH.every(v=>Number.isInteger(v)&&v>0&&v<=2147483647)||hintRect!==undefined&&!validRect(hintRect))throw new RangeError('头发边界或画布尺寸无效');
 let [x,y,width,height]=bounds;
 if(hintRect&&hintRect[2]>0&&hintRect[3]>0){
  if(width>0&&height>0){
   const right=Math.max(x+width,hintRect[0]+hintRect[2]),bottom=Math.max(y+height,hintRect[1]+hintRect[3]);
   x=Math.min(x,hintRect[0]);y=Math.min(y,hintRect[1]);width=right-x;height=bottom-y;
  }else [x,y,width,height]=hintRect;
 }
 if(width===0||height===0)return [0,0,0,0];
 const padding=Math.trunc(F(F(width)*F(.2)));
 const output=[Math.max(0,x-padding),Math.max(0,y-padding),Math.min(canvasWH[0],width+padding+Math.min(x,padding)),Math.min(canvasWH[1],height+padding+Math.min(y,padding))];
 if(!output.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647))throw new RangeError('头发边界超出已复原的整数范围');
 return output;
}

// 复原缓存图层的补边：MatOp opcode0x30创建零画布，再将图层复制到缓存Rect。
function alignPreparedHairPlane({data,width,height,stride,channels=1,rect,canvasWH}){
 if(![1,3].includes(channels))throw new RangeError('头发缓存图层仅支持灰度或RGB');
 stride=stride??width*channels;
 layout({data,width:width*channels,height,stride});
 if(!Number.isSafeInteger(width)||width<0||!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||!Array.isArray(canvasWH)||canvasWH.length!==2||!canvasWH.every(v=>Number.isSafeInteger(v)&&v>=0))throw new RangeError('头发缓存矩形或画布无效');
 const [x,y,rw,rh]=rect,[cw,ch]=canvasWH;
 if(!(cw>0&&ch>0&&rw>0&&rh>0&&(rw!==cw||rh!==ch||x!==0||y!==0)))return {data,width,height,stride,channels};
 if(rw!==width||rh!==height||x+rw>cw||y+rh>ch||!Number.isSafeInteger(cw*ch*channels))throw new RangeError('头发缓存图层与矩形不匹配或超出画布');
 const output=new Uint8Array(cw*ch*channels),rowBytes=width*channels;
 for(let row=0;row<height;row++)output.set(data.subarray(row*stride,row*stride+rowBytes),((row+y)*cw+x)*channels);
 return {data:output,width:cw,height:ch,stride:cw*channels,channels};
}

// 消费已经完成坐标取整的Rect；取整函数身份尚未关闭，不能在此推断它。
function clipPreparedHairRect({rect,canvasWH}){
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647)||!Array.isArray(canvasWH)||canvasWH.length!==2||!canvasWH.every(v=>Number.isInteger(v)&&v>=0&&v<=2147483647))throw new RangeError('头发裁切矩形或画布无效');
 const [x,y,width,height]=rect,[cw,ch]=canvasWH;
 if(width<=0||height<=0||cw===0||ch===0)return [0,0,0,0];
 if(![x+width,y+height].every(v=>v>=-2147483648&&v<=2147483647))throw new RangeError('头发裁切超出已复原的整数范围');
 const left=Math.max(0,x),top=Math.max(0,y),right=Math.min(cw,x+width),bottom=Math.min(ch,y+height);
 return right>left&&bottom>top?[left,top,right-left,bottom-top]:[0,0,0,0];
}

// 组合已提供的外轮廓、面积筛选与边界扩展；轮廓生成本身仍需上层提供。
function prepareHairContourRegion({contours,canvasWH,hintRect}){
 if(!Array.isArray(canvasWH)||canvasWH.length!==2||!canvasWH.every(v=>Number.isInteger(v)&&v>0&&v<=2147483647))throw new RangeError('头发画布尺寸无效');
 const selection=selectPreparedHairContours(contours);
 let left=canvasWH[0],top=canvasWH[1],right=-1,bottom=-1;
 for(const index of selection.selected)for(const [x,y] of contours[index]){
  if(x<0||y<0||x>=canvasWH[0]||y>=canvasWH[1])throw new RangeError('头发轮廓超出画布');
  left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
 }
 const bounds=right<0?[0,0,0,0]:[left,top,right-left+1,bottom-top+1];
 return {...selection,bounds,expanded:expandPreparedHairBounds({bounds,canvasWH,hintRect})};
}

// 填充本模块跟踪得到的连续外轮廓；四邻域背景保留斜接边界，轮廓内部孔洞填白。
function fillTracedHairContours(contours,selected,width,height){
 const output=new Uint8Array(width*height);
 if(!selected.length)return output;
 const W=width+2,H=height+2,total=W*H;
 const state=new Uint8Array(total),queue=new Int32Array(total);
 for(const index of selected)for(const [x,y] of contours[index])state[(y+1)*W+x+1]=1;
 let begin=0,end=1;state[0]=2;queue[0]=0;
 while(begin<end){
  const p=queue[begin++],x=p%W;
  if(x>0&&state[p-1]===0){state[p-1]=2;queue[end++]=p-1;}
  if(x+1<W&&state[p+1]===0){state[p+1]=2;queue[end++]=p+1;}
  if(p>=W&&state[p-W]===0){state[p-W]=2;queue[end++]=p-W;}
  if(p+W<total&&state[p+W]===0){state[p+W]=2;queue[end++]=p+W;}
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(state[(y+1)*W+x+1]!==2)output[y*width+x]=255;
 return output;
}

// 从柔边蒙版筛选、填充并扫描候选处理区域；保留输入柔边，原分割来源与跨尺寸映射尚未接入。
function prepareHairMaskRegion({data,width,height,stride=width,hintRect}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0)throw new RangeError('头发画布尺寸无效');
 const binary=thresholdPreparedHairMask({data,width,height,stride});
 const contours=findPreparedHairContours({data:binary,width,height});
 const selection=selectPreparedHairContours(contours);
 const selectedMask=fillTracedHairContours(contours,selection.selected,width,height);
 const bounds=scanPreparedHairBounds({data:selectedMask,width,height});
 return {...selection,selectedMask,bounds,expanded:expandPreparedHairBounds({bounds,canvasWH:[width,height],hintRect})};
}

module.exports={findPreparedHairContours,scanPreparedHairBounds,thresholdPreparedHairMask,selectPreparedHairContours,expandPreparedHairBounds,alignPreparedHairPlane,clipPreparedHairRect,prepareHairContourRegion,prepareHairMaskRegion};
