import {publicFacesFromLegacy} from './public-bright-eye-cache.js';
import {validateBrightEyeFaces} from './bright-eye-parameters.js';
const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.0)*.5;gl_Position=vec4(position,0.,1.);}`;
// 独立修饰公式：眼白轻度去色提亮，虹膜局部对比，高光仅增强已有亮点。
const fragment=`precision highp float;varying vec2 uv;uniform sampler2D sourceTex,maskTex;uniform vec4 roi,degrees;uniform vec2 stepSize;
void main(){vec4 original=texture2D(sourceTex,uv);vec3 c=original.rgb;vec2 local=(vec2(uv.x,1.-uv.y)-roi.xy)/roi.zw;vec3 mask=vec3(0.);
if(local.x>=0.&&local.x<=1.&&local.y>=0.&&local.y<=1.)mask=texture2D(maskTex,local).rgb;
float l=dot(c,vec3(.2126,.7152,.0722));vec3 white=mix(c,vec3(l),.25)+(1.-c)*.23;
vec3 blur=(texture2D(sourceTex,uv+vec2(stepSize.x,0.)).rgb+texture2D(sourceTex,uv-vec2(stepSize.x,0.)).rgb+texture2D(sourceTex,uv+vec2(0.,stepSize.y)).rgb+texture2D(sourceTex,uv-vec2(0.,stepSize.y)).rgb)*.25;
vec3 iris=clamp(c+(c-blur)*.8+(c-.45)*.16,0.,1.);
vec3 result=mix(c,white,mask.r*degrees.x*degrees.y*smoothstep(.16,.55,l));result+=mask.g*degrees.x*degrees.z*(iris-c);
float glint=smoothstep(.45,.9,max(c.r,max(c.g,c.b)));result+=(1.-result)*mask.b*degrees.x*degrees.w*glint*.35;
gl_FragColor=vec4(clamp(result,0.,1.),original.a);}`;
export class PublicBrightEyePipeline{
 constructor(gl){
  this.gl=gl;this.rows=[];this.textures=new Set();this.ext=gl.getExtension('OES_vertex_array_object');if(!this.ext)throw Error('亮眼图形状态不可用');this.disposed=false;
  const state=this.capture(),shaders=[];
  try{
   this.program=gl.createProgram();if(!this.program)throw Error('亮眼程序创建失败');
   for(const [kind,code]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(kind);if(!s)throw Error('亮眼程序创建失败');shaders.push(s);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(this.program,s);}
   gl.bindAttribLocation(this.program,0,'position');gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
   this.u=Object.fromEntries(['sourceTex','maskTex','roi','degrees','stepSize'].map(k=>[k,gl.getUniformLocation(this.program,k)]));this.framebuffer=gl.createFramebuffer();this.buffer=gl.createBuffer();this.vao=this.ext.createVertexArrayOES();if(!this.framebuffer||!this.buffer||!this.vao)throw Error('亮眼图形资源不足');
   this.ext.bindVertexArrayOES(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);this.scratch=[this.texture(null,1,1),this.texture(null,1,1)];
  }catch(error){this.dispose();throw error;}finally{shaders.forEach(s=>gl.deleteShader(s));this.restore(state);}
 }
 capture(){const gl=this.gl,active=gl.getParameter(gl.ACTIVE_TEXTURE),textures=[0,1].map(i=>{gl.activeTexture(gl.TEXTURE0+i);return gl.getParameter(gl.TEXTURE_BINDING_2D);});gl.activeTexture(active);return {active,textures,program:gl.getParameter(gl.CURRENT_PROGRAM),framebuffer:gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport:gl.getParameter(gl.VIEWPORT),array:gl.getParameter(gl.ARRAY_BUFFER_BINDING),vao:gl.getParameter(this.ext.VERTEX_ARRAY_BINDING_OES),caps:[gl.DITHER,gl.BLEND,gl.SCISSOR_TEST,gl.DEPTH_TEST,gl.CULL_FACE].map(c=>[c,gl.isEnabled(c)]),color:gl.getParameter(gl.COLOR_WRITEMASK),pixel:[gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_ALIGNMENT].map(k=>gl.getParameter(k))};}
 restore(s){const gl=this.gl;gl.useProgram(s.program);gl.bindFramebuffer(gl.FRAMEBUFFER,s.framebuffer);gl.viewport(...s.viewport);this.ext.bindVertexArrayOES(s.vao);gl.bindBuffer(gl.ARRAY_BUFFER,s.array);for(const [c,enabled]of s.caps)enabled?gl.enable(c):gl.disable(c);gl.colorMask(...s.color);[gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_ALIGNMENT].forEach((k,i)=>gl.pixelStorei(k,s.pixel[i]));s.textures.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);});gl.activeTexture(s.active);}
 texture(data,w,h){const gl=this.gl,t=gl.createTexture();if(!t)throw Error('亮眼纹理创建失败');this.textures.add(t);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);if(gl.getError()!==gl.NO_ERROR)throw Error('亮眼纹理分配失败');return t;}
 setFaces(faces,sourceWH){
  if(faces===this.facesRef&&String(sourceWH)===this.sourceKey)return;
  const checked=publicFacesFromLegacy(validateBrightEyeFaces(faces,{sourceWH})),before=new Set(this.textures),rows=[];
  try{for(const face of checked)for(const s of face.sides)rows.push({...s,sourceWH:face.sourceWH,texture:this.texture(Uint8Array.from(atob(s.rgbaBase64),c=>c.charCodeAt(0)),s.maskWidth,s.maskHeight)});}catch(error){for(const t of this.textures)if(!before.has(t)){this.gl.deleteTexture(t);this.textures.delete(t);}throw error;}
  for(const row of this.rows){this.gl.deleteTexture(row.texture);this.textures.delete(row.texture);}this.rows=rows;this.facesRef=faces;this.sourceKey=String(sourceWH);
 }
 render(source,p,w,h,{faces=[],sourceWH}={}){
  if(this.disposed)throw Error('亮眼渲染器已释放');if(!faces.length||!(p.brightEyeLeftMaster>0||p.brightEyeRightMaster>0))return source;
  const gl=this.gl,state=this.capture();
  try{
   this.setFaces(faces,sourceWH);this.ext.bindVertexArrayOES(this.vao);for(const [c]of state.caps)gl.disable(c);gl.colorMask(true,true,true,true);gl.viewport(0,0,w,h);gl.useProgram(this.program);gl.uniform1i(this.u.sourceTex,0);gl.uniform1i(this.u.maskTex,1);gl.uniform2f(this.u.stepSize,1.5/sourceWH[0],1.5/sourceWH[1]);
   if(this.width!==w||this.height!==h){gl.activeTexture(gl.TEXTURE0);for(const t of this.scratch){gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);}if(gl.getError()!==gl.NO_ERROR)throw Error('亮眼输出分配失败');this.width=w;this.height=h;}
   let current=source;
   for(const row of this.rows){const prefix='brightEye'+(row.side?'Left':'Right'),degrees=['Master','White','Other','High'].map(k=>Math.max(0,Math.min(100,Number(p[prefix+k])||0))/100);if(!degrees[0])continue;
    const target=current===this.scratch[0]?this.scratch[1]:this.scratch[0];gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('亮眼输出不可用');
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,current);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,row.texture);gl.uniform4fv(this.u.degrees,degrees);gl.uniform4f(this.u.roi,row.roi[0]/sourceWH[0],row.roi[1]/sourceWH[1],row.roi[2]/sourceWH[0],row.roi[3]/sourceWH[1]);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);current=target;
   }
   if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('亮眼图形处理失败');return current;
  }finally{this.restore(state);}
 }
 dispose(){if(this.disposed)return;const gl=this.gl;for(const t of this.textures)gl.deleteTexture(t);this.textures.clear();if(this.buffer)gl.deleteBuffer(this.buffer);if(this.framebuffer)gl.deleteFramebuffer(this.framebuffer);if(this.program)gl.deleteProgram(this.program);if(this.vao)this.ext.deleteVertexArrayOES(this.vao);this.rows=[];this.facesRef=null;this.disposed=true;}
}
