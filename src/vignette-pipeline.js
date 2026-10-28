import {vignetteFragment,vignetteVertex,vignetteInverse,vignetteForward} from './recovered-vignette.js';
import {constantCurveIndices} from './vignette-compatibility.js';
// Full-image RGBA8 pass. Placement in PhotoEngine is an integration choice.
export class VignettePipeline {
 constructor(gl,buffer){
  this.gl=gl;this.buffer=buffer;
  const shaders=[];let program;
  try{
   const compile=(type,code)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('compile');return s;};
   const vs=compile(gl.VERTEX_SHADER,vignetteVertex),fs=compile(gl.FRAGMENT_SHADER,constantCurveIndices(vignetteFragment));
   program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.bindAttribLocation(program,0,'a_position');gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('link');this.program=program;
   this.uniforms=Object.fromEntries(['s_texture','u_pcv_amount','u_pcv_midpoint','u_pcv_roundness','u_pcv_feather','u_pcv_highlights','u_pcv_aspect','u_pcv_landscape','u_pcv_use_roi','u_pcv_roi_p01','u_pcv_roi_p23','u_acr3_inv[0]','u_acr3_fwd[0]'].map(k=>[k,gl.getUniformLocation(program,k)]));
   this.texture=gl.createTexture();this.framebuffer=gl.createFramebuffer();
  }catch{if(program)gl.deleteProgram(program);throw Error('暗角处理不可用，请更新显卡驱动后重试。');}
  finally{for(const s of shaders)gl.deleteShader(s);}
 }
 render(source,p,w,h,originalWidth,originalHeight){
  if(p.vignetteAmount===0)return source;
  const gl=this.gl,u=this.uniforms;
  gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.viewport(0,0,w,h);
  gl.uniform1i(u.s_texture,0);
  for(const [key,name] of [['vignetteAmount','amount'],['vignetteMidpoint','midpoint'],['vignetteRoundness','roundness'],['vignetteFeather','feather'],['vignetteHighlights','highlights']])gl.uniform1f(u['u_pcv_'+name],p[key]/100);
  gl.uniform1f(u.u_pcv_aspect,Math.max(originalWidth,originalHeight)/Math.min(originalWidth,originalHeight));gl.uniform1f(u.u_pcv_landscape,originalWidth>=originalHeight?1:0);
  gl.uniform1f(u.u_pcv_use_roi,0);gl.uniform4f(u.u_pcv_roi_p01,0,0,1,0);gl.uniform4f(u.u_pcv_roi_p23,1,1,0,1);
  gl.uniform4fv(u['u_acr3_inv[0]'],vignetteInverse);gl.uniform4fv(u['u_acr3_fwd[0]'],vignetteForward);
  try{
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
   if(this.width!==w||this.height!==h){
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.width=w;this.height=h;
   }
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('暗角处理缓冲区创建失败。');
   gl.bindTexture(gl.TEXTURE_2D,source);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.texture;
  }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
 }
 dispose(){this.gl.deleteTexture(this.texture);this.gl.deleteFramebuffer(this.framebuffer);this.gl.deleteProgram(this.program);}
}
