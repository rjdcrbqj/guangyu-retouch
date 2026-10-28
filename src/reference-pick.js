// 取色裁剪：规则来自 LIVE 142ea0a50（phase42）——
// origin = clamp(INT32(point-32), 0, D-1)，size = min(64, D-origin)。
// 边缘可小于64，不做"把窗口推回图内"的替代。不制造默认尺寸。
const SIDE=64, HALF=32;

function integerPoint(point,width,height){
 if(!Array.isArray(point)||point.length!==2||!point.every(Number.isInteger))
  throw TypeError('取色需要两个整数点坐标');
 const [x,y]=point;
 if(x<0||y<0||x>=width||y>=height)throw RangeError('取色点必须落在图内');
 return point;
}
function dimensions(o){
 if(!o||typeof o!=='object')throw TypeError('取色需要明确的图像供给');
 const {data,width,height}=o;
 if(!(data instanceof Uint8Array))throw TypeError('取色需要BYTE图像数据');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)
  throw RangeError('取色图像尺寸无效');
 return {data,width,height};
}
// 原版对两个 extent query 的正整数 D 各取一次 origin/size，两轴独立。
function cropRect(point,width,height){
 const [x,y]=integerPoint(point,width,height);
 const ox=Math.min(Math.max(x-HALF,0),width-1),oy=Math.min(Math.max(y-HALF,0),height-1);
 const w=Math.min(SIDE,width-ox),h=Math.min(SIDE,height-oy);
 return [ox,oy,w,h];
}

// 原始像素帧的裁剪；channels固定4（RGBA8）。返回独立BYTE副本，不修改输入。
function cropReferencePatch({data,width,height,point}={}){
 const src=dimensions({data,width,height});
 const [ox,oy,w,h]=cropRect(point,width,height);
 const out=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)
  out.set(src.data.subarray(((oy+y)*width+ox)*4,((oy+y)*width+ox+w)*4),y*w*4);
 return {data:out,width:w,height:h,stride:w*4,rect:[ox,oy,w,h]};
}

// 参考蒙版裁切：只做矩形裁切，**不做放大**。
// 放大到64×64必须由主进程用已验证的 native code2 标量数学（inference/skin-reference/mono64.cjs）完成，
// 渲染端是浏览器ESM，不能require该CJS，因此这里绝不自行发明插值。
function cropReferenceMaskRaw({data,width,height,stride,point}={}){
 const src=dimensions({data,width,height});
 if(!Number.isSafeInteger(stride)||stride<width||stride*height>src.data.length)
  throw TypeError('取色蒙版需要有效stride及完整BYTE1数据');
 const [ox,oy,w,h]=cropRect(point,width,height);
 const out=new Uint8Array(w*h);
 for(let y=0;y<h;y++)out.set(src.data.subarray((oy+y)*stride+ox,(oy+y)*stride+ox+w),y*w);
 return {data:out,width:w,height:h,stride:w,rect:[ox,oy,w,h]};
}

// 参考图/参考蒙版的下游合同是严格64×64（解码器只接受64×64）。
// 边缘裁剪可小于64，但"把小于64的裁剪变成64×64"的原版规则尚未证实，
// 因此产品路径要求完整64×64裁剪，而不是自行发明补边或缩放。
function requireFullReferencePatch(rect){
 if(!Array.isArray(rect)||rect.length!==4)throw TypeError('取色需要明确的裁剪矩形');
 const [, , w,h]=rect;
 if(w!==SIDE||h!==SIDE)
  throw RangeError(`该点过于靠近边缘，只能取到${w}×${h}；请向画面内部重新点选以获得完整64×64参考区域`);
 return rect;
}

export {cropReferencePatch,cropReferenceMaskRaw,requireFullReferencePatch};
