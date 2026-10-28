import {toothMaskCombineVertex,toothMaskCombineFragment,whitenTeethV3Vertex,whitenTeethV3Fragment,getNativeTeethLUTs} from './recovered-native-teeth.js';
import {projectFromPod,mvpForDimensions,teethV3Weights,decodeNativeTeethRGBA,nativeTeethPodSix,validateNativeTeethFaces} from './teeth-v3-parameters.js';
const SIDE=800,identity3=new Float32Array([1,0,0,0,1,0,0,0,1]),identity4=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function setup(gl,t){gl.bindTexture(gl.TEXTURE_2D,t);for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);}
function upload(gl,t,bytes,w,h,rgb=false){gl.activeTexture(gl.TEXTURE0);setup(gl,t);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,rgb?gl.RGB:gl.RGBA,w,h,0,rgb?gl.RGB:gl.RGBA,gl.UNSIGNED_BYTE,bytes);}
// Original shader/table/800 mask graph. FUNC_ADD and storage orientation are explicit APP adapters.
export class NativeTeethPipeline {
 constructor(gl){
  this.gl=gl;this.programs=[];this.textures=[];this.framebuffers=[];this.buffers=[];this.faceTextures=[];this.facesRef=null;
  if(gl.getParameter(gl.MAX_TEXTURE_SIZE)<800||Math.min(...gl.getParameter(gl.MAX_VIEWPORT_DIMS))<800||gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<4)throw Error('设备不支持原牙齿美白的图形处理尺寸。');
  try{
   const program=(vertex,fragment,names)=>{const shaders=[];let p;try{
    for(const [type,src]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(type);if(!shader)throw Error('shader');shaders.push(shader);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('compile');}
    p=gl.createProgram();if(!p)throw Error('program');this.programs.push(p);shaders.forEach(s=>gl.attachShader(p,s));gl.bindAttribLocation(p,0,'a_position');gl.bindAttribLocation(p,1,'a_texcoord');gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('link');
    const uniforms=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(p,n)]));if(Object.values(uniforms).some(v=>v===null))throw Error('uniform');return {p,uniforms};
   }finally{shaders.forEach(s=>gl.deleteShader(s));}};
   this.combine=program(toothMaskCombineVertex,toothMaskCombineFragment,['s_mask','u_whiten','u_bright','u_mvpMatrix','u_mvpMaskMatrix']);
   this.final=program(whitenTeethV3Vertex,whitenTeethV3Fragment,['s_src_texture','s_mask_texture','s_whiten_texture','s_bright_texture','u_softlight_alpha','u_degree','u_mvpMatrix']);
   const buffer=values=>{const b=gl.createBuffer();if(!b)throw Error('buffer');this.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);return b;};
   // Positions retain the original 800 order; only G.y reflects APP DOM source's FLIP_Y storage.
   this.combineBuffer=buffer(new Float32Array([0,800,0,0,800,800,1,0,0,0,0,1,800,0,1,1]));
   this.finalBuffer=buffer(new Float32Array([-1,-1,0,0,1,-1,1,0,-1,1,0,1,1,1,1,1]));
   const texture=()=>{const t=gl.createTexture();if(!t)throw Error('texture');this.textures.push(t);return t;};
   this.maskTexture=texture();upload(gl,this.maskTexture,null,SIDE,SIDE);this.outputTexture=texture();gl.activeTexture(gl.TEXTURE0);setup(gl,this.outputTexture);this.manualTexture=texture();
   const luts=getNativeTeethLUTs();this.whitenTexture=texture();upload(gl,this.whitenTexture,luts.whiten,512,512,true);this.brightTexture=texture();upload(gl,this.brightTexture,luts.bright,512,512,true);
   for(const t of [this.maskTexture,this.outputTexture]){const f=gl.createFramebuffer();if(!f)throw Error('framebuffer');this.framebuffers.push(f);gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);}
   this.maskFramebuffer=this.framebuffers[0];this.outputFramebuffer=this.framebuffers[1];gl.bindFramebuffer(gl.FRAMEBUFFER,this.maskFramebuffer);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('mask framebuffer');
  }catch{this.dispose();throw Error('原牙齿美白初始化失败，请重试或更新显卡驱动。');}
  finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
 }
 vertices(b){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);}
 bind(p,name,unit,t){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(p.uniforms[name],unit);}
 setFaces(faces,sourceWH){
  if(faces===this.facesRef&&JSON.stringify(sourceWH)===this.facesSourceWH)return;
  const gl=this.gl,checked=validateNativeTeethFaces(faces,{sourceWH}),created=[];
  try{for(const face of checked){const matrix=new Float32Array(projectFromPod({podSix:nativeTeethPodSix(face),sourceWH:face.sourceWH,maskWH:face.maskWH}).originalGLColumnMajor),t=gl.createTexture();if(!t)throw Error('牙齿平面缓冲区创建失败');created.push({t,matrix});upload(gl,t,decodeNativeTeethRGBA(face),384,384);}}
  catch(error){created.forEach(x=>gl.deleteTexture(x.t));throw error;}
  this.faceTextures.forEach(x=>gl.deleteTexture(x.t));this.faceTextures=created;this.facesRef=faces;this.facesSourceWH=JSON.stringify(sourceWH);
 }
 render(source,p,w,h,{faces=[],manualMask,revision=0,sourceWH}={}){
  const weights=teethV3Weights(p);if(!weights.active)return source;
  const gl=this.gl,previous={dither:gl.isEnabled(gl.DITHER),blend:gl.isEnabled(gl.BLEND),scissor:gl.isEnabled(gl.SCISSOR_TEST),depth:gl.isEnabled(gl.DEPTH_TEST),colorMask:gl.getParameter(gl.COLOR_WRITEMASK),equationRGB:gl.getParameter(gl.BLEND_EQUATION_RGB),equationAlpha:gl.getParameter(gl.BLEND_EQUATION_ALPHA),srcRGB:gl.getParameter(gl.BLEND_SRC_RGB),dstRGB:gl.getParameter(gl.BLEND_DST_RGB),srcAlpha:gl.getParameter(gl.BLEND_SRC_ALPHA),dstAlpha:gl.getParameter(gl.BLEND_DST_ALPHA)};
  try{
   gl.disable(gl.DITHER);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.DEPTH_TEST);gl.colorMask(true,true,true,true);gl.disable(gl.BLEND);
   this.setFaces(faces,sourceWH);let masks=this.faceTextures;
   if(!masks.length){
    if(!manualMask?.width||!manualMask?.height)return source;
    if(this.manualRevision!==revision||this.manualMask!==manualMask){const data=manualMask.getContext('2d').getImageData(0,0,manualMask.width,manualMask.height).data,raw=new Uint8Array(data.length);for(let i=0;i<data.length;i+=4){raw[i+1]=data[i+3];raw[i+3]=255;}upload(gl,this.manualTexture,raw,manualMask.width,manualMask.height);this.manualRevision=revision;this.manualMask=manualMask;}
    masks=[{t:this.manualTexture,matrix:identity3}];
   }
   gl.useProgram(this.combine.p);this.vertices(this.combineBuffer);gl.uniformMatrix4fv(this.combine.uniforms.u_mvpMatrix,false,new Float32Array(mvpForDimensions()));gl.uniform1f(this.combine.uniforms.u_whiten,weights.whiten);gl.uniform1f(this.combine.uniforms.u_bright,weights.bright);gl.viewport(0,0,SIDE,SIDE);gl.bindFramebuffer(gl.FRAMEBUFFER,this.maskFramebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE);gl.enable(gl.BLEND);
   for(const mask of masks){this.bind(this.combine,'s_mask',0,mask.t);gl.uniformMatrix3fv(this.combine.uniforms.u_mvpMaskMatrix,false,mask.matrix);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}gl.disable(gl.BLEND);
   gl.activeTexture(gl.TEXTURE0);setup(gl,this.outputTexture);if(this.width!==w||this.height!==h){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.width=w;this.height=h;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.outputFramebuffer);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('牙齿美白输出缓冲区创建失败');
   gl.viewport(0,0,w,h);gl.useProgram(this.final.p);this.vertices(this.finalBuffer);gl.uniformMatrix4fv(this.final.uniforms.u_mvpMatrix,false,identity4);gl.uniform1f(this.final.uniforms.u_degree,1);gl.uniform1f(this.final.uniforms.u_softlight_alpha,0);[source,this.maskTexture,this.whitenTexture,this.brightTexture].forEach((t,i)=>this.bind(this.final,['s_src_texture','s_mask_texture','s_whiten_texture','s_bright_texture'][i],i,t));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.outputTexture;
  }finally{
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disableVertexAttribArray(1);gl.blendEquationSeparate(previous.equationRGB,previous.equationAlpha);gl.blendFuncSeparate(previous.srcRGB,previous.dstRGB,previous.srcAlpha,previous.dstAlpha);gl.colorMask(...previous.colorMask);
   for(const [key,cap]of [['dither',gl.DITHER],['blend',gl.BLEND],['scissor',gl.SCISSOR_TEST],['depth',gl.DEPTH_TEST]])previous[key]?gl.enable(cap):gl.disable(cap);
  }
 }
 dispose(){const gl=this.gl;this.faceTextures.forEach(x=>gl.deleteTexture(x.t));this.faceTextures=[];for(const t of this.textures)gl.deleteTexture(t);for(const f of this.framebuffers)gl.deleteFramebuffer(f);for(const b of this.buffers)gl.deleteBuffer(b);for(const p of this.programs)gl.deleteProgram(p);this.textures=[];this.framebuffers=[];this.buffers=[];this.programs=[];this.facesRef=null;}
}
