// 将超长边照片按二维图块装入纹理，保留每个源像素，不使用大整数线性像素索引。
export function textureLayout(sourceWidth,sourceHeight,limit){
 if(![sourceWidth,sourceHeight,limit].every(v=>Number.isSafeInteger(v)&&v>0))throw RangeError('图像及纹理尺寸无效');
 if(sourceWidth<=limit&&sourceHeight<=limit)return {sourceWidth,sourceHeight,width:sourceWidth,height:sourceHeight,tileWidth:sourceWidth,tileHeight:sourceHeight,sourceColumns:1,atlasColumns:1,tiles:1,packed:false};
 const side=Math.min(1024,Math.max(1,Math.floor(limit/2))),tileWidth=Math.min(sourceWidth,side),tileHeight=Math.min(sourceHeight,side),sourceColumns=Math.ceil(sourceWidth/tileWidth),tiles=sourceColumns*Math.ceil(sourceHeight/tileHeight);
 const maxColumns=Math.floor(limit/tileWidth),maxRows=Math.floor(limit/tileHeight),atlasColumns=Math.min(maxColumns,Math.max(Math.ceil(tiles/maxRows),Math.ceil(Math.sqrt(tiles*tileHeight/tileWidth))));
 if(tiles>maxColumns*maxRows){const error=RangeError('照片像素超过设备纹理容量，请先保存工程');error.code='TEXTURE_CAPACITY';throw error;}
 return {sourceWidth,sourceHeight,width:atlasColumns*tileWidth,height:Math.ceil(tiles/atlasColumns)*tileHeight,tileWidth,tileHeight,sourceColumns,atlasColumns,tiles,packed:true};
}

// 源图与打包画布均使用左上角原点；供上传、区域读取和测试共用。
export function atlasPoint(layout,x,y){
 const {tileWidth:tw,tileHeight:th,sourceColumns,atlasColumns}=layout,index=Math.floor(y/th)*sourceColumns+Math.floor(x/tw);
 return {x:index%atlasColumns*tw+x%tw,y:Math.floor(index/atlasColumns)*th+y%th};
}

// 预览、原尺寸查看和导出统一使用同一sRGB栅格入口。
export function imageRaster(image,width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d',{colorSpace:'srgb'}).drawImage(image,0,0,width,height);return canvas;
}
// 在显示方向的原像素坐标裁剪；保存预乘画布供原有上传接口统一处理alpha。
export async function prepareTextureImage(image,layout,{isCanceled=()=>false}={}){
 if(!layout.packed)return [];
 const tiles=[],check=()=>{if(isCanceled())throw new DOMException('原像素准备已取消','AbortError');};
 try{
  check();
  if((image.naturalWidth||image.width)!==layout.sourceWidth||(image.naturalHeight||image.height)!==layout.sourceHeight)throw Error('原像素图块尺寸与照片不一致');
  for(let y=0;y<layout.sourceHeight;y+=layout.tileHeight)for(let x=0;x<layout.sourceWidth;x+=layout.tileWidth){
   check();
   const p=atlasPoint(layout,x,y),width=Math.min(layout.tileWidth,layout.sourceWidth-x),height=Math.min(layout.tileHeight,layout.sourceHeight-y),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d',{colorSpace:'srgb'}).drawImage(image,x,y,width,height,0,0,width,height);tiles.push({...p,width,height,canvas});
   if(tiles.length%8===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  check();return tiles;
 }catch(error){releaseTextureTiles(tiles);throw error;}
}
// 上传会同步读取画布；随后缩小背板，避免照片继续持有原尺寸CPU像素。
export function releaseTextureTiles(tiles=[]){for(const {canvas} of tiles)canvas.width=canvas.height=1;}

// 从打包结果复制原图区域；不让打包接缝进入显示层或输出。
export function drawTextureRegion(context,canvas,layout,{x,y,width,height},dx=0,dy=0){
 if(!layout.packed){context.drawImage(canvas,x,y,width,height,dx,dy,width,height);return;}
 for(let sy=y;sy<y+height;){const h=Math.min(layout.tileHeight-sy%layout.tileHeight,y+height-sy);for(let sx=x;sx<x+width;){const w=Math.min(layout.tileWidth-sx%layout.tileWidth,x+width-sx),p=atlasPoint(layout,sx,sy);context.drawImage(canvas,p.x,p.y,w,h,dx+sx-x,dy+sy-y,w,h);sx+=w;}sy+=h;}
}

// 浏览器可能缩小默认绘图背板；显式帧缓冲按小块读取原像素，避免整张CPU副本。
export function drawFramebufferRegion(context,gl,framebuffer,layout,{x,y,width,height},dx=0,dy=0){
 const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
 try{
  for(let sy=y;sy<y+height;){const h=Math.min(1024,layout.tileHeight-sy%layout.tileHeight,y+height-sy);for(let sx=x;sx<x+width;){
   const w=Math.min(1024,layout.tileWidth-sx%layout.tileWidth,x+width-sx),p=atlasPoint(layout,sx,sy),pixels=new Uint8Array(w*h*4),data=context.createImageData(w,h);
   gl.readPixels(p.x,layout.height-p.y-h,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   for(let row=0;row<h;row++)data.data.set(pixels.subarray((h-1-row)*w*4,(h-row)*w*4),row*w*4);
   context.putImageData(data,dx+sx-x,dy+sy-y);sx+=w;
  }sy+=h;}
  if(gl.getError()!==gl.NO_ERROR)throw Error('原尺寸像素读取失败，请先保存工程');
 }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous);}
}
