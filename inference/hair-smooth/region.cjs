'use strict';
const F=Math.fround;

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

// 消费外部轮廓点列；轮廓提取和填充尚未在此模块复原。
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

module.exports={scanPreparedHairBounds,thresholdPreparedHairMask,selectPreparedHairContours,expandPreparedHairBounds,alignPreparedHairPlane,clipPreparedHairRect};
