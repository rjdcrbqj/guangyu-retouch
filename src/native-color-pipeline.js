import {hslFragment,tempTintFragment,nativeColorVertex,getNativeColorTables} from './recovered-native-color.js';
import {createHSLTables,createTempTintParameters,hslControlsFromParams,tempTintDegreeFromParams} from './native-color-parameters.js';
const staticSamplers=['gamma_map_texture','invconstrast_texture','constrast_texture','invgamma_map_texture'];
const gainNames=Array.from({length:4},(_,i)=>['r','g','b'].map(c=>c+'_gain'+(i+1))).flat();
function setupTexture(gl,texture){gl.bindTexture(gl.TEXTURE_2D,texture);for(const name of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,name,gl.LINEAR);for(const name of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);}
function uploadFloat(gl,texture,data,w,h){setupTexture(gl,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,w,h,0,gl.LUMINANCE,gl.FLOAT,data);}
// Four original tables owned once by a PhotoEngine context, shared by both passes.
export class NativeColorTables {
 constructor(gl){
  this.gl=gl;this.textures=[];
  if(gl.getParameter(gl.MAX_TEXTURE_SIZE)<2049)throw Error('设备不支持原调色映射表尺寸（需要2049像素）。');
  if(!gl.getExtension('OES_texture_float')||!gl.getExtension('OES_texture_float_linear'))throw Error('原调色需要浮点图形支持，请更新显卡驱动后重试。');
  try{const data=getNativeColorTables();gl.activeTexture(gl.TEXTURE0);for(const key of ['gamma','inverseContrast','contrast','inverseGamma']){const texture=gl.createTexture();if(!texture)throw Error('texture');this.textures.push(texture);uploadFloat(gl,texture,data[key],key==='gamma'?2049:256,key==='gamma'?1:256);}}
  catch{this.dispose();throw Error('原调色映射表创建失败，请重试。');}
 }
 dispose(){for(const texture of this.textures)this.gl.deleteTexture(texture);this.textures=[];}
}
// Full-image RGBA8. The APP pass order and relative slider mapping are explicit choices.
export class NativeColorPipeline {
 constructor(gl,buffer,kind,tables){
  if(!['hsl','tempTint'].includes(kind))throw Error('Unknown native color pass');
  this.gl=gl;this.buffer=buffer;this.kind=kind;this.tables=tables;this.dynamic=[];
  if(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<(kind==='hsl'?8:5))throw Error('显卡可用图形资源不足，无法启用原调色。');
  const shaders=[];let program;
  try{
   const compile=(type,code)=>{const shader=gl.createShader(type);if(!shader)throw Error('shader');shaders.push(shader);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('compile');return shader;};
   const vertex=compile(gl.VERTEX_SHADER,nativeColorVertex),fragment=compile(gl.FRAGMENT_SHADER,kind==='hsl'?hslFragment:tempTintFragment.replace(/\b__srcA\b/g,'nativeSourceAlpha'));
   program=gl.createProgram();if(!program)throw Error('program');gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.bindAttribLocation(program,0,'a_position');gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('link');this.program=program;
   const names=['s_texture',...staticSamplers,...(kind==='hsl'?['huelut_texture','saturationlut_texture','lumalut_texture']:[...gainNames,'u_temp','u_tint','u_cmat[0]'])];this.uniforms=Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(program,name)]));
   this.texture=gl.createTexture();this.framebuffer=gl.createFramebuffer();if(!this.texture||!this.framebuffer)throw Error('buffer');
   if(kind==='hsl')for(let i=0;i<3;i++){const texture=gl.createTexture();if(!texture)throw Error('table');this.dynamic.push(texture);}
  }catch{this.dispose();if(program&&program!==this.program)gl.deleteProgram(program);throw Error('原调色处理不可用，请更新显卡驱动后重试。');}
  finally{for(const shader of shaders)gl.deleteShader(shader);}
 }
 render(source,p,w,h){
  if(!p[this.kind==='hsl'?'hslEnabled':'tempTintEnabled'])return source;
  const gl=this.gl,u=this.uniforms;gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.viewport(0,0,w,h);
  gl.uniform1i(u.s_texture,0);
  const textures=[source,this.tables.textures[0],this.tables.textures[1]];
  if(this.kind==='hsl'){
   const curves=createHSLTables(hslControlsFromParams(p));let i=0;
   for(const [key,name] of [['hue','huelut_texture'],['saturation','saturationlut_texture'],['luma','lumalut_texture']]){gl.activeTexture(gl.TEXTURE0+3+i);uploadFloat(gl,this.dynamic[i],curves[key],74,1);gl.uniform1i(u[name],3+i);textures.push(this.dynamic[i++]);}
   textures.push(this.tables.textures[2],this.tables.textures[3]);
  }else{
   const parameters=createTempTintParameters(...tempTintDegreeFromParams(p));gainNames.forEach((name,i)=>gl.uniform1f(u[name],parameters.gains[i]));gl.uniform1f(u.u_temp,parameters.weights[0]);gl.uniform1f(u.u_tint,parameters.weights[1]);gl.uniform1fv(u['u_cmat[0]'],parameters.matrix);textures.push(this.tables.textures[2],this.tables.textures[3]);
  }
  const units=this.kind==='hsl'?[1,2,6,7]:[1,2,3,4];staticSamplers.forEach((name,i)=>gl.uniform1i(u[name],units[i]));
  try{
   gl.activeTexture(gl.TEXTURE0);setupTexture(gl,this.texture);
   if(this.width!==w||this.height!==h){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.width=w;this.height=h;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('原调色处理缓冲区创建失败。');
   textures.forEach((texture,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);});gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.texture;
  }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
 }
 dispose(){const gl=this.gl;for(const texture of this.dynamic)gl.deleteTexture(texture);this.dynamic=[];if(this.texture)gl.deleteTexture(this.texture);if(this.framebuffer)gl.deleteFramebuffer(this.framebuffer);if(this.program)gl.deleteProgram(this.program);}
}
