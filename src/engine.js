import {teethV3Weights} from './teeth-v3-parameters.js';
import {NativeTeethPipeline} from './native-teeth-pipeline.js';
import {NativeBrightEyePipeline} from './native-bright-eye-pipeline.js';
import {NativeColorTables,NativeColorPipeline} from './native-color-pipeline.js';
import {VignettePipeline} from './vignette-pipeline.js';
import {FinishingPipeline} from './finishing-pipeline.js';
import {recoveredFinishingGLSL} from './recovered-finishing.js';
import {recoveredAdjustmentsGLSL} from './recovered-adjustments.js';
import { recoveredSharpenGLSL } from './recovered-sharpen.js';
import { recoveredColorGLSL } from './recovered-color.js';
import { normalizeParams } from './model.js';

const vertex=`attribute vec2 position; varying vec2 uv; void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}`;
// 保边柔化和基础调色为独立实现；精细调色使用已提取的 PaintFX 公式。
const fragment=`precision highp float;
varying vec2 uv; uniform sampler2D sourceTex,skinTex,teethTex,aiTex,unprocessedTex;
uniform vec2 stepSize; uniform float radius,exposure,contrast,saturation,warmth,skinSmooth,skinBright,teethBright,localExposure,split;
uniform float vibrance,nativeContrast,contrastPivot,localVibrance,localContrast,localContrastPivot;
uniform vec2 sharpStep;uniform float sharpAmount,sharpRadius;
uniform float fadeAmount,hueRotation,blackWhiteAmount,localFade,localHue,localBlackWhite;
uniform float grayNoise,grayNoiseDark,colorNoise,colorNoiseDark,finishingScope;
${recoveredAdjustmentsGLSL}
${recoveredFinishingGLSL}
${recoveredColorGLSL}
${recoveredSharpenGLSL}
void main(){
 vec4 original=texture2D(sourceTex,uv); vec3 c=original.rgb;
 if(sharpAmount>0.0)c=recoveredUSM(sourceTex,uv,sharpStep,sharpRadius,sharpAmount);
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
 if(nativeContrast!=0.0)c=recoveredContrast(clamp(c,0.0,1.0),nativeContrast,contrastPivot);
 if(vibrance!=0.0)c=recoveredVibrance(clamp(c,0.0,1.0),vibrance);
 if(fadeAmount!=0.0||hueRotation!=0.0||blackWhiteAmount!=0.0)c=recoveredAdjustments(clamp(c,0.0,1.0),fadeAmount,hueRotation,blackWhiteAmount);
 c=mix(c,vec3(1.0),sm*skinBright*0.18);
 float l=dot(c,vec3(0.2126,0.7152,0.0722));
 vec3 tooth=mix(c,vec3(l),0.55);tooth=mix(tooth,vec3(1.0),0.22);
 c=mix(c,tooth,tm*teethBright);
 float am=texture2D(aiTex,uv).a;
 vec3 localColor=pow(max(pow(max(c,0.0),vec3(2.2))*exp2(localExposure),0.0),vec3(1.0/2.2));
 if(localContrast!=0.0)localColor=recoveredContrast(clamp(localColor,0.0,1.0),localContrast,localContrastPivot);
 if(localVibrance!=0.0)localColor=recoveredVibrance(clamp(localColor,0.0,1.0),localVibrance);
 if(localFade!=0.0||localHue!=0.0||localBlackWhite!=0.0)localColor=recoveredAdjustments(clamp(localColor,0.0,1.0),localFade,localHue,localBlackWhite);
 c=mix(c,localColor,am);
 vec3 grain=c;
 if(grayNoise>0.0||grayNoiseDark>0.0)grain=recoveredGrayNoise(grain,gl_FragCoord.xy,grayNoise,grayNoiseDark);
 if(colorNoise>0.0||colorNoiseDark>0.0)grain=recoveredColorNoise(grain,gl_FragCoord.xy,colorNoise,colorNoiseDark);
 c=mix(c,grain,finishingScope>0.5?1.0:am);
 if(split>=0.0 && uv.x<split)c=texture2D(unprocessedTex,uv).rgb;
 gl_FragColor=vec4(clamp(c,0.0,1.0),original.a);
}`;

export class PhotoEngine {
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false});
  if(!this.gl)throw new Error('图形加速不可用，请更新显卡驱动后重试。');
  const gl=this.gl;const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
  const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.bindAttribLocation(this.program,0,'position');gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
  gl.useProgram(this.program);const b=gl.createBuffer();this.buffer=b;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  this.textures=Array.from({length:5},()=>gl.createTexture());this.uniforms={};
  for(const name of ['fadeAmount','hueRotation','blackWhiteAmount','localFade','localHue','localBlackWhite','grayNoise','grayNoiseDark','colorNoise','colorNoiseDark','finishingScope','unprocessedTex','sharpStep','sharpAmount','sharpRadius','stepSize','radius','exposure','contrast','saturation','warmth','skinSmooth','skinBright','teethBright','split','sourceTex','skinTex','teethTex','aiTex','localExposure','vibrance','nativeContrast','contrastPivot','localVibrance','localContrast','localContrastPivot'])this.uniforms[name]=gl.getUniformLocation(this.program,name);
  gl.uniform1i(this.uniforms.sourceTex,0);gl.uniform1i(this.uniforms.skinTex,1);gl.uniform1i(this.uniforms.teethTex,2);gl.uniform1i(this.uniforms.aiTex,3);gl.uniform1i(this.uniforms.unprocessedTex,4);
  this.maxSize=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  const empty=document.createElement('canvas');empty.width=1;empty.height=1;this.empty=empty;this.setMasks(empty,empty,empty);
 }
 upload(index,image){
  const gl=this.gl;gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
 }
 setImage(image,{maxSize=1600,comparison=image}={}){
  this.original=image;const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  const scale=Math.min(1,maxSize/Math.max(w,h));const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
  if(width>this.maxSize||height>this.maxSize)throw new Error(`照片尺寸超过设备上限（${this.maxSize}像素）。`);
  this.canvas.width=width;this.canvas.height=height;let source=image;
  if(scale<1){source=document.createElement('canvas');source.width=width;source.height=height;source.getContext('2d').drawImage(image,0,0,width,height);}
  this.upload(0,source);
  // 前后对比始终使用导入原图，处理结果只进入工作纹理。
  this.comparisonTexture=this.textures[0];if(comparison===image)return;
  let before=comparison;
  if((comparison.naturalWidth||comparison.width)!==width||(comparison.naturalHeight||comparison.height)!==height){before=document.createElement('canvas');before.width=width;before.height=height;before.getContext('2d').drawImage(comparison,0,0,width,height);}
  this.upload(4,before);
  this.comparisonTexture=this.textures[4];
 }
 setMasks(skin,teeth,ai=this.empty,nativeTeethFaces=[]){this.nativeTeethFaces=nativeTeethFaces;this.maskRevision=(this.maskRevision??0)+1;this.skin=skin;this.teeth=teeth;this.ai=ai;this.upload(1,skin);this.upload(2,teeth);this.upload(3,ai); }
 setBrightEyeFaces(faces=[]){this.brightEyeFaces=faces;}
 render(params,split=-1){
  const gl=this.gl,p=normalizeParams(params);
  const active=['pixelate','medianDenoise','desharpen','motionBlur','radialBlur','rotateBlur','dispersion'].some(k=>p[k]>0);
  if(active&&!this.finishing)this.finishing=new FinishingPipeline(gl,this.buffer);
  let source=active?this.finishing.render(this.textures[0],this.textures[3],p,this.canvas.width,this.canvas.height,this.original.naturalWidth||this.original.width,this.original.naturalHeight||this.original.height):this.textures[0];
  if(p.tempTintEnabled||p.hslEnabled){if(!this.nativeColorTables)this.nativeColorTables=new NativeColorTables(gl);for(const [kind,key,field] of [['tempTint','tempTintEnabled','nativeTempTint'],['hsl','hslEnabled','nativeHSL']])if(p[key]){if(!this[field])this[field]=new NativeColorPipeline(gl,this.buffer,kind,this.nativeColorTables);source=this[field].render(source,p,this.canvas.width,this.canvas.height);}}
  if(teethV3Weights(p).active){if(!this.nativeTeeth)this.nativeTeeth=new NativeTeethPipeline(gl);source=this.nativeTeeth.render(source,p,this.canvas.width,this.canvas.height,{faces:this.nativeTeethFaces,manualMask:this.teeth,revision:this.maskRevision,sourceWH:[this.original.naturalWidth||this.original.width,this.original.naturalHeight||this.original.height]});}
  if((p.brightEyeLeftMaster>0||p.brightEyeRightMaster>0)&&this.brightEyeFaces?.length){if(!this.nativeBrightEye)this.nativeBrightEye=new NativeBrightEyePipeline(gl);source=this.nativeBrightEye.render(source,p,this.canvas.width,this.canvas.height,{faces:this.brightEyeFaces,sourceWH:[this.original.naturalWidth||this.original.width,this.original.naturalHeight||this.original.height]});}
  if(p.vignetteAmount!==0){if(!this.vignette)this.vignette=new VignettePipeline(gl,this.buffer);source=this.vignette.render(source,p,this.canvas.width,this.canvas.height,this.original.naturalWidth||this.original.width,this.original.naturalHeight||this.original.height);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  for(let i=0;i<5;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,i===0?source:i===4?this.comparisonTexture:this.textures[i]);}
  gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.viewport(0,0,this.canvas.width,this.canvas.height);
  gl.uniform2f(this.uniforms.stepSize,1/this.canvas.width,1/this.canvas.height);gl.uniform1f(this.uniforms.radius,Math.max(this.canvas.width,this.canvas.height)/1600*3);
  for(const name of ['fadeAmount','hueRotation','blackWhiteAmount','localFade','localHue','localBlackWhite','grayNoise','grayNoiseDark','colorNoise','colorNoiseDark','finishingScope','exposure','contrast','saturation','warmth','localExposure'])gl.uniform1f(this.uniforms[name],p[name]);
  for(const name of ['skinSmooth','skinBright','teethBright','vibrance','nativeContrast','contrastPivot','localVibrance','localContrast','localContrastPivot'])gl.uniform1f(this.uniforms[name],p[name]/100);
  // 半径按原图像素定义；预览纹理已缩小，属于近似，完整原图网格只用于导出。
  gl.uniform2f(this.uniforms.sharpStep,1/(this.original.naturalWidth||this.original.width),1/(this.original.naturalHeight||this.original.height));
  gl.uniform1f(this.uniforms.sharpAmount,p.sharpAmount/100);gl.uniform1f(this.uniforms.sharpRadius,p.sharpRadius);
  gl.uniform1f(this.uniforms.split,split);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  if(gl.isContextLost())throw new Error('图形处理已中断，请保存工程并重新打开应用。');
 }
 // 导出创建全尺寸临时渲染器，画笔覆盖和对比线不会进入图片。
 async exportBlob(params,type='image/jpeg'){
  const canvas=document.createElement('canvas');const full=new PhotoEngine(canvas);
  try{
   full.setImage(this.original,{maxSize:Infinity});full.setMasks(this.skin,this.teeth,this.ai,this.nativeTeethFaces);full.setBrightEyeFaces(this.brightEyeFaces);full.render(params);
   let output=canvas;
   if(type==='image/jpeg'){output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const ctx=output.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0);}
   return await new Promise((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(new Error('导出失败，照片可能过大。')),type,.95));
  }finally{full.dispose();}
 }
 dispose(){this.nativeBrightEye?.dispose();this.nativeTeeth?.dispose();this.nativeHSL?.dispose();this.nativeTempTint?.dispose();this.nativeColorTables?.dispose();this.vignette?.dispose();this.finishing?.dispose();this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
