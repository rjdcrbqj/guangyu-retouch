import {PublicBrightEyePipeline} from './public-bright-eye-pipeline.js';
import {teethV3Weights} from './teeth-v3-parameters.js';
import {NativeTeethPipeline} from './native-teeth-pipeline.js';

import {NativeColorTables,NativeColorPipeline} from './public-color-pipeline.js';
import {VignettePipeline} from './public-vignette.js';
import {FinishingPipeline} from './finishing-pipeline.js';
import {publicFinishingGLSL} from './public-effects.js';
import {publicAdjustmentsGLSL} from './public-effects.js';
import { publicSharpenGLSL } from './public-effects.js';
import { publicColorGLSL } from './public-effects.js';
import { normalizeParams } from './model.js';
import {textureLayout,imageRaster,prepareTextureImage,releaseTextureTiles,drawTextureRegion,drawFramebufferRegion} from './texture-layout.js';
import {virtualFragment,bindVirtualTexture} from './virtual-texture.js';
import {IDENTITY_CORNERS,perspectiveMatrix} from './public-perspective.js';

const vertex=`attribute vec2 position; varying vec2 uv; void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}`;
const perspectiveFragment=`precision highp float;
varying vec2 uv;
uniform sampler2D inputFrame, originalFrame;
uniform float compareSplit;
uniform mat3 outputToSource;
void main(){
 if(compareSplit>=0.0 && uv.x<compareSplit){
  gl_FragColor=texture2D(originalFrame,uv);
  return;
 }
 vec3 mapped=outputToSource*vec3(uv.x,1.0-uv.y,1.0);
 vec4 premultiplied=texture2D(inputFrame,vec2(mapped.x/mapped.z,1.0-mapped.y/mapped.z));
 gl_FragColor=vec4(premultiplied.a>0.0?premultiplied.rgb/premultiplied.a:vec3(0.0),premultiplied.a);
}`;

function compileProgram(gl,source,samplers){
 const shaders=[];
 let program;
 try{
  for(const [type,code] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,virtualFragment(source,samplers)]]){
   const shader=gl.createShader(type);shaders.push(shader);
   gl.shaderSource(shader,code);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
  }
  program=gl.createProgram();
  for(const shader of shaders)gl.attachShader(program,shader);
  gl.bindAttribLocation(program,0,'position');gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  return program;
 }catch(error){if(program)gl.deleteProgram(program);throw error;}
 finally{shaders.forEach(shader=>gl.deleteShader(shader));}
}
// 基础调色、局部修饰、锐化及颗粒均使用自主实现的公开公式。
const fragment=`precision highp float;
varying vec2 uv; uniform sampler2D sourceTex,skinTex,teethTex,aiTex,unprocessedTex;
uniform vec2 stepSize; uniform float radius,exposure,contrast,saturation,warmth,skinSmooth,skinBright,teethBright,localExposure,split;
uniform bool premultiplyOutput;
uniform float vibrance,nativeContrast,contrastPivot,localVibrance,localContrast,localContrastPivot;
uniform vec2 sharpStep;uniform float sharpAmount,sharpRadius;
uniform float fadeAmount,hueRotation,blackWhiteAmount,localFade,localHue,localBlackWhite;
uniform float grayNoise,grayNoiseDark,colorNoise,colorNoiseDark,finishingScope;
${publicAdjustmentsGLSL}
${publicFinishingGLSL}
${publicColorGLSL}
${publicSharpenGLSL}
void main(){
 vec4 original=texture2D(sourceTex,uv); vec3 c=original.rgb;
 if(sharpAmount>0.0)c=publicUSM(sourceTex,uv,sharpStep,sharpRadius,sharpAmount);
 float sm=texture2D(skinTex,uv).a; float tm=texture2D(teethTex,uv).a;
 if(skinSmooth>0.0 && sm>0.0){
  vec3 sum=vec3(0.0);float weights=0.0;
  for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++){
   vec2 offset=vec2(float(x),float(y));vec3 n=texture2D(sourceTex,uv+offset*stepSize*radius).rgb;
   vec3 delta=n-c;float w=exp(-dot(offset,offset)*0.3-dot(delta,delta)*45.0);
   sum+=n*w;weights+=w;
  }
  c=mix(c,sum/weights,sm*skinSmooth*0.9);
 }
 c=pow(max(pow(max(c,0.0),vec3(2.2))*exp2(exposure),0.0),vec3(1.0/2.2));
 c=(c-0.5)*(1.0+contrast/100.0)+0.5;
 float luminance=dot(c,vec3(0.2126,0.7152,0.0722));
 c=mix(vec3(luminance),c,1.0+saturation/100.0);
 c+=vec3(0.07,-0.012,-0.07)*warmth/50.0;
 if(nativeContrast!=0.0)c=publicContrast(clamp(c,0.0,1.0),nativeContrast,contrastPivot);
 if(vibrance!=0.0)c=publicVibrance(clamp(c,0.0,1.0),vibrance);
 if(fadeAmount!=0.0||hueRotation!=0.0||blackWhiteAmount!=0.0)c=publicAdjustments(clamp(c,0.0,1.0),fadeAmount,hueRotation,blackWhiteAmount);
 c=mix(c,vec3(1.0),sm*skinBright*0.18);
 float l=dot(c,vec3(0.2126,0.7152,0.0722));
 vec3 tooth=mix(c,vec3(l),0.55);tooth=mix(tooth,vec3(1.0),0.22);
 c=mix(c,tooth,tm*teethBright);
 float am=texture2D(aiTex,uv).a;
 vec3 localColor=pow(max(pow(max(c,0.0),vec3(2.2))*exp2(localExposure),0.0),vec3(1.0/2.2));
 if(localContrast!=0.0)localColor=publicContrast(clamp(localColor,0.0,1.0),localContrast,localContrastPivot);
 if(localVibrance!=0.0)localColor=publicVibrance(clamp(localColor,0.0,1.0),localVibrance);
 if(localFade!=0.0||localHue!=0.0||localBlackWhite!=0.0)localColor=publicAdjustments(clamp(localColor,0.0,1.0),localFade,localHue,localBlackWhite);
 c=mix(c,localColor,am);
 vec3 grain=c;
 if(grayNoise>0.0||grayNoiseDark>0.0)grain=publicGrayNoise(grain,gl_FragCoord.xy,grayNoise,grayNoiseDark);
 if(colorNoise>0.0||colorNoiseDark>0.0)grain=publicColorNoise(grain,gl_FragCoord.xy,colorNoise,colorNoiseDark);
 c=mix(c,grain,finishingScope>0.5?1.0:am);
 if(split>=0.0 && uv.x<split)c=texture2D(unprocessedTex,uv).rgb;
 vec3 rgb=clamp(c,0.0,1.0);
 gl_FragColor=vec4(premultiplyOutput?rgb*original.a:rgb,original.a);
}`;

export class PhotoEngine {
 constructor(canvas){
  this.preparedImages=new Map();this.disposed=false;
  this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false});
  if(!this.gl)throw new Error('图形加速不可用，请更新显卡驱动后重试。');
  const gl=this.gl;this.program=compileProgram(gl,fragment,['sourceTex','unprocessedTex','source']);
  gl.useProgram(this.program);const b=gl.createBuffer();this.buffer=b;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  this.textures=Array.from({length:5},()=>gl.createTexture());this.uniforms={};
  for(const name of ['fadeAmount','hueRotation','blackWhiteAmount','localFade','localHue','localBlackWhite','grayNoise','grayNoiseDark','colorNoise','colorNoiseDark','finishingScope','unprocessedTex','sharpStep','sharpAmount','sharpRadius','stepSize','radius','exposure','contrast','saturation','warmth','skinSmooth','skinBright','teethBright','split','sourceTex','skinTex','teethTex','aiTex','localExposure','vibrance','nativeContrast','contrastPivot','localVibrance','localContrast','localContrastPivot'])this.uniforms[name]=gl.getUniformLocation(this.program,name);
  gl.uniform1i(this.uniforms.sourceTex,0);gl.uniform1i(this.uniforms.skinTex,1);gl.uniform1i(this.uniforms.teethTex,2);gl.uniform1i(this.uniforms.aiTex,3);gl.uniform1i(this.uniforms.unprocessedTex,4);
  this.maxSize=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  const empty=document.createElement('canvas');empty.width=1;empty.height=1;this.empty=empty;this.setMasks(empty,empty,empty);
 }
 async prepareImage(image){
  if(this.disposed)throw new DOMException('原像素准备已取消','AbortError');
  const layout=textureLayout(image.naturalWidth||image.width,image.naturalHeight||image.height,this.maxSize);if(!layout.packed)return;
  const existing=this.preparedImages.get(image);if(existing)return existing.promise;
  const entry={layout};this.preparedImages.set(image,entry);
  entry.promise=prepareTextureImage(image,layout,{isCanceled:()=>this.disposed}).then(tiles=>{
   if(this.disposed){releaseTextureTiles(tiles);throw new DOMException('原像素准备已取消','AbortError');}
   entry.tiles=tiles;
  }).catch(error=>{if(this.preparedImages.get(image)===entry)this.preparedImages.delete(image);throw error;});
  return entry.promise;
 }
 upload(index,image,layout){
  const gl=this.gl;gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  if(layout?.packed){
   const entry=this.preparedImages.get(image);if(!entry?.tiles)throw Error('原像素图块尚未准备，请重新打开照片');
   try{
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,layout.width,layout.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    if(gl.getError()!==gl.NO_ERROR)throw Error('设备没有足够图形内存处理原尺寸照片，请先保存工程');
    for(const tile of entry.tiles)gl.texSubImage2D(gl.TEXTURE_2D,0,tile.x,layout.height-tile.y-tile.height,gl.RGBA,gl.UNSIGNED_BYTE,tile.canvas);
    if(gl.getError()!==gl.NO_ERROR)throw Error('原尺寸图块上传失败，请先保存工程');
   }finally{releaseTextureTiles(entry.tiles);this.preparedImages.delete(image);}
  }
  else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
 }
 setImage(image,{maxSize=1600,comparison=image}={}){
  this.releasePerspectiveTarget();
  this.original=image;const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  const scale=Math.min(1,maxSize/Math.max(w,h));const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
  this.layout=textureLayout(width,height,this.maxSize);this.frameWidth=width;this.frameHeight=height;
  this.canvas.width=this.layout.width;this.canvas.height=this.layout.height;const source=this.layout.packed?image:imageRaster(image,width,height);
  this.prepareOutput();
  this.upload(0,source,this.layout);
  // 前后对比始终使用导入原图，处理结果只进入工作纹理。
  this.comparisonTexture=this.textures[0];if(comparison===image)return;
  const before=this.layout.packed?comparison:imageRaster(comparison,width,height);
  this.upload(4,before,this.layout);
  this.comparisonTexture=this.textures[4];
 }
 // 默认背板受浏览器总面积限制；显式纹理帧缓冲保持完整网格。
 prepareOutput(){
  const gl=this.gl;gl.deleteFramebuffer(this.outputFramebuffer);gl.deleteTexture(this.outputTexture);this.outputFramebuffer=null;this.outputTexture=null;
  if(gl.drawingBufferWidth===this.layout.width&&gl.drawingBufferHeight===this.layout.height)return;
  this.canvas.width=this.canvas.height=1;
  this.outputTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.outputTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,this.layout.width,this.layout.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  this.outputFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.outputFramebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.outputTexture,0);
  const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE,error=gl.getError();gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  if(!complete||error!==gl.NO_ERROR)throw Error('设备没有足够图形内存处理原尺寸照片，请先保存工程');
 }
 setMasks(skin,teeth,ai=this.empty,nativeTeethFaces=[]){this.nativeTeethFaces=nativeTeethFaces;this.maskRevision=(this.maskRevision??0)+1;this.skin=skin;this.teeth=teeth;this.ai=ai;this.upload(1,skin);this.upload(2,teeth);this.upload(3,ai); }
 setBrightEyeFaces(faces=[]){this.brightEyeFaces=faces;}
 releasePerspectiveTarget(){
  if(!this.perspectiveTarget)return;
  this.gl.deleteFramebuffer(this.perspectiveTarget.framebuffer);
  this.gl.deleteTexture(this.perspectiveTarget.texture);
  this.perspectiveTarget=null;
 }
 preparePerspectiveTarget(){
  if(this.perspectiveTarget)return this.perspectiveTarget;
  const gl=this.gl,{width,height}=this.layout;
  if(!this.perspectiveProgram)this.perspectiveProgram=compileProgram(gl,perspectiveFragment,['inputFrame','originalFrame']);
  const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();
  this.perspectiveTarget={texture,framebuffer};
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  const error=gl.getError();
  if(error!==gl.NO_ERROR||gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.outputFramebuffer??null);
   this.releasePerspectiveTarget();
   throw Error('设备没有足够图形内存执行透视校正。');
  }
  return this.perspectiveTarget;
 }
 renderPerspective(target,matrix,split){
  const gl=this.gl,program=this.perspectiveProgram;
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.outputFramebuffer??null);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,target.texture);
  gl.uniform1i(gl.getUniformLocation(program,'inputFrame'),0);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D,this.comparisonTexture);
  gl.uniform1i(gl.getUniformLocation(program,'originalFrame'),4);
  gl.uniform1f(gl.getUniformLocation(program,'compareSplit'),split);
  const [a,b,c,d,e,f,g,h,i]=matrix;
  gl.uniformMatrix3fv(gl.getUniformLocation(program,'outputToSource'),false,[a,d,g,b,e,h,c,f,i]);
  bindVirtualTexture(gl,program,this.layout);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 }
 render(params,split=-1,perspective=null){
  const gl=this.gl,p=normalizeParams(params);
  const matrix=perspective==null?null:perspectiveMatrix(perspective);
  const warped=matrix&&perspective.some((point,index)=>point.some((value,axis)=>value!==IDENTITY_CORNERS[index][axis]));
  const active=['pixelate','medianDenoise','desharpen','motionBlur','radialBlur','rotateBlur','dispersion'].some(k=>p[k]>0);
  if(active&&!this.finishing)this.finishing=new FinishingPipeline(gl,this.buffer);
  let source=active?this.finishing.render(this.textures[0],this.textures[3],p,this.layout.width,this.layout.height,this.original.naturalWidth||this.original.width,this.original.naturalHeight||this.original.height,this.layout):this.textures[0];
  if(p.tempTintEnabled||p.hslEnabled){if(!this.nativeColorTables)this.nativeColorTables=new NativeColorTables(gl);for(const [kind,key,field] of [['tempTint','tempTintEnabled','nativeTempTint'],['hsl','hslEnabled','nativeHSL']])if(p[key]){if(!this[field])this[field]=new NativeColorPipeline(gl,this.buffer,kind,this.nativeColorTables);source=this[field].render(source,p,this.layout.width,this.layout.height,this.layout);}}
  if(teethV3Weights(p).active){if(!this.nativeTeeth)this.nativeTeeth=new NativeTeethPipeline(gl);source=this.nativeTeeth.render(source,p,this.layout.width,this.layout.height,{faces:this.nativeTeethFaces,manualMask:this.teeth,revision:this.maskRevision,sourceWH:[this.original.naturalWidth||this.original.width,this.original.naturalHeight||this.original.height],layout:this.layout});}
  if((p.brightEyeLeftMaster>0||p.brightEyeRightMaster>0)&&this.brightEyeFaces?.length){if(!this.publicBrightEye)this.publicBrightEye=new PublicBrightEyePipeline(gl);source=this.publicBrightEye.render(source,p,this.layout.width,this.layout.height,{faces:this.brightEyeFaces,sourceWH:[this.original.naturalWidth||this.original.width,this.original.naturalHeight||this.original.height],layout:this.layout});}
  if(p.vignetteAmount!==0){if(!this.vignette)this.vignette=new VignettePipeline(gl,this.buffer);source=this.vignette.render(source,p,this.layout.width,this.layout.height,this.original.naturalWidth||this.original.width,this.original.naturalHeight||this.original.height,this.layout);}
  // 人脸、蒙版和局部修饰在源图坐标完成，再对合成结果作逆采样。
  const perspectiveTarget=warped?this.preparePerspectiveTarget():null;
  if(!warped)this.releasePerspectiveTarget();
  gl.bindFramebuffer(gl.FRAMEBUFFER,perspectiveTarget?.framebuffer??this.outputFramebuffer??null);
  for(let i=0;i<5;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,i===0?source:i===4?this.comparisonTexture:this.textures[i]);}
  gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.viewport(0,0,this.layout.width,this.layout.height);
  gl.uniform1i(gl.getUniformLocation(this.program,'premultiplyOutput'),Boolean(perspectiveTarget));
  bindVirtualTexture(gl,this.program,this.layout);gl.uniform2f(this.uniforms.stepSize,1/this.frameWidth,1/this.frameHeight);gl.uniform1f(this.uniforms.radius,Math.max(this.frameWidth,this.frameHeight)/1600*3);
  for(const name of ['fadeAmount','hueRotation','blackWhiteAmount','localFade','localHue','localBlackWhite','grayNoise','grayNoiseDark','colorNoise','colorNoiseDark','finishingScope','exposure','contrast','saturation','warmth','localExposure'])gl.uniform1f(this.uniforms[name],p[name]);
  for(const name of ['skinSmooth','skinBright','teethBright','vibrance','nativeContrast','contrastPivot','localVibrance','localContrast','localContrastPivot'])gl.uniform1f(this.uniforms[name],p[name]/100);
  // 半径按原图像素定义；预览纹理已缩小，属于近似，完整原图网格只用于导出。
  gl.uniform2f(this.uniforms.sharpStep,1/(this.original.naturalWidth||this.original.width),1/(this.original.naturalHeight||this.original.height));
  gl.uniform1f(this.uniforms.sharpAmount,p.sharpAmount/100);gl.uniform1f(this.uniforms.sharpRadius,p.sharpRadius);
  gl.uniform1f(this.uniforms.split,perspectiveTarget?-1:split);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  if(perspectiveTarget)this.renderPerspective(perspectiveTarget,matrix,split);
  if(gl.isContextLost())throw new Error('图形处理已中断，请保存工程并重新打开应用。');
 }
 drawRegion(context,region,dx=0,dy=0){if(this.outputFramebuffer)drawFramebufferRegion(context,this.gl,this.outputFramebuffer,this.layout,region,dx,dy);else drawTextureRegion(context,this.canvas,this.layout,region,dx,dy);}
 // 导出创建全尺寸临时渲染器，画笔覆盖和对比线不会进入图片。
 async exportBlob(params,type='image/jpeg',perspective=null){
  const canvas=document.createElement('canvas');const full=new PhotoEngine(canvas);
  try{
   full.maxSize=this.maxSize;await full.prepareImage(this.original);full.setImage(this.original,{maxSize:Infinity});full.setMasks(this.skin,this.teeth,this.ai,this.nativeTeethFaces);full.setBrightEyeFaces(this.brightEyeFaces);full.render(params,-1,perspective);
   let output=canvas;
   if(full.layout.packed||full.outputFramebuffer){output=document.createElement('canvas');output.width=full.frameWidth;output.height=full.frameHeight;const ctx=output.getContext('2d');ctx.imageSmoothingEnabled=false;full.drawRegion(ctx,{x:0,y:0,width:full.frameWidth,height:full.frameHeight});}
   if(type==='image/jpeg'){const rendered=output;output=document.createElement('canvas');output.width=rendered.width;output.height=rendered.height;const ctx=output.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(rendered,0,0);}
   return await new Promise((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(new Error('导出失败，照片可能过大。')),type,.95));
  }finally{full.dispose();}
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const entry of this.preparedImages.values())releaseTextureTiles(entry.tiles);this.preparedImages.clear();this.releasePerspectiveTarget();if(this.perspectiveProgram)this.gl.deleteProgram(this.perspectiveProgram);this.publicBrightEye?.dispose();this.nativeBrightEye?.dispose();this.nativeTeeth?.dispose();this.nativeHSL?.dispose();this.nativeTempTint?.dispose();this.nativeColorTables?.dispose();this.vignette?.dispose();this.finishing?.dispose();this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
