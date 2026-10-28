import {brightEyeVertex,brightEyeFragment,brightEyeWarpVertex,brightEyeWarpFragment,brightEyeAssets,brightEyeMeshes} from './recovered-bright-eye.js';
import {brightEyeExtraVertex,brightEyeExtraFragment,brightEyeProjectionVertex,brightEyeProjectionFragment} from './recovered-bright-eye-extra.js';
import {scissor as extraScissor} from './native-extra-projection.js';
import {brightEyeWeights,brightEyeFloatValues,decodeBrightEyeHighlight,decodeBrightEyeExtra,validateBrightEyeFaces} from './bright-eye-parameters.js';
const F=Math.fround,decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const matrix=(w,h)=>new Float32Array([F(2/w),0,0,0,0,F(2/h),0,0,0,0,-1,0,-1,-1,-0,1]);
const maskUV=new Float32Array([0,1,1,1,0,0,1,0]);
const copyVertex='attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
const copyFragment='precision highp float;uniform sampler2D source;uniform vec2 size;void main(){gl_FragColor=texture2D(source,vec2(gl_FragCoord.x/size.x,1.0-gl_FragCoord.y/size.y));}';

export class NativeBrightEyePipeline{
 constructor(gl){
  this.gl=gl;this.textures=new Set();this.buffers=new Set();this.programs=new Set();this.framebuffers=new Set();this.rows=[];this.extraRows=[];this.disposed=false;this.textureUnitCount=Math.min(9,gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));
  this.vaoExt=gl.getExtension('OES_vertex_array_object');if(!this.vaoExt)throw Error('亮眼需要图形设备支持独立网格状态');const initial=this.captureState();
  try{
   if(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<8)throw Error('亮眼需要至少八个纹理采样单元');
   this.maxSize=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
   this.vao=this.vaoExt.createVertexArrayOES();if(!this.vao)throw Error('亮眼网格状态创建失败');
   this.warp=this.program('#define WARP_TO_ROI\n'+brightEyeWarpVertex,brightEyeWarpFragment,['a_position','a_material_texcoord'],['u_mvpMatrix','u_position_tl_point','u_position_norm_vec','u_roi_size','s_material_texture']);
   this.eye=this.program(brightEyeVertex,brightEyeFragment,['a_position','a_mask_texcoord'],['u_mvpMatrix','s_src_texture','s_mask_texture','s_pupil_mask_texture','s_white_area_lut_texture','s_pupil_other_lut_texture','s_pupil_sat_lut_texture','s_pupil_highlight_mask_texture','s_pupil_highlight_lut_texture','u_sharp_width_offset','u_sharp_height_offset','u_sharp_threshold','u_sharp_factor','u_alpha','u_white_area_alpha','u_pupil_other_alpha','u_pupil_other_sharp_alpha','u_pupil_highlight_alpha','u_pupil_sat_alpha']);
   this.copy=this.program(copyVertex,copyFragment,['position'],['source','size']);
   this.extraEye=this.textureUnitCount>=9?this.program(brightEyeExtraVertex,brightEyeExtraFragment,['a_position','a_mask_texcoord','a_extra_mask_texcoord'],[...Object.keys(this.eye.u),'s_extra_mask_texture']):null;
   this.project=this.program(brightEyeProjectionVertex,brightEyeProjectionFragment,['t'],['d','mq','mr','ms']);
   this.xy=this.buffer();this.uv=this.buffer();this.indices=this.buffer();this.full=this.buffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.full);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
   this.extraUV=this.buffer();this.projectQuad=this.buffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.projectQuad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,1,1,1,-1,-1,1,-1]),gl.STATIC_DRAW);
   this.framebuffer=gl.createFramebuffer();if(!this.framebuffer)throw Error('亮眼帧缓冲区创建失败');this.framebuffers.add(this.framebuffer);
   const previousFlip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),previousPremult=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),previousAlignment=gl.getParameter(gl.UNPACK_ALIGNMENT);
   try{
    this.assets={};for(const [name,w,h]of [['left_eye',300,300],['right_eye',300,300],['eye_pupil',150,150],['ly',512,512]])this.assets[name]=this.texture(decode(brightEyeAssets[name]),w,h);
    for(const name of ['white','pupil','highlight']){const values=decode(brightEyeAssets[name+'Curve']),rgba=new Uint8Array(1024);for(let i=0;i<256;i++)rgba.set([values[i],values[i],values[i],255],i*4);this.assets[name+'Curve']=this.texture(rgba,256,1);}
    this.scratch=Array.from({length:5},()=>this.texture(null,1,1));this.width=0;this.height=0;this.storageHasExtra=false;this.extraGeneratedKey=null;
   }finally{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,previousFlip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,previousPremult);gl.pixelStorei(gl.UNPACK_ALIGNMENT,previousAlignment);}
  }catch(error){this.dispose();throw error;}finally{this.restoreState(initial);}
 }
 program(vertex,fragment,attributes,names){
  const gl=this.gl,p=gl.createProgram(),shaders=[];if(!p)throw Error('亮眼着色程序创建失败');this.programs.add(p);
  try{for(const [type,text]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);if(!s)throw Error('亮眼着色器创建失败');shaders.push(s);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}attributes.forEach((name,i)=>gl.bindAttribLocation(p,i,name));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return {p,u:Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(p,name)]))};}
  finally{shaders.forEach(s=>gl.deleteShader(s));}
 }
 buffer(){const b=this.gl.createBuffer();if(!b)throw Error('亮眼网格缓冲区创建失败');this.buffers.add(b);return b;}
 checkGL(message){if(this.gl.getError()!==this.gl.NO_ERROR)throw Error(message);}
 texture(bytes,w,h){
  const gl=this.gl,t=gl.createTexture();if(!t)throw Error('亮眼纹理创建失败');this.textures.add(t);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);
  for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
  for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);this.checkGL('亮眼纹理分配失败，请缩小照片或重新打开应用');return t;
 }
 deleteTexture(t){this.gl.deleteTexture(t);this.textures.delete(t);}
 target(texture,w,h){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('亮眼输出缓冲区不可用');gl.viewport(0,0,w,h);}
 arrays(xy,uv){const gl=this.gl;for(const [i,b,v]of [[0,this.xy,xy],[1,this.uv,uv]]){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,v,gl.STREAM_DRAW);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,2,gl.FLOAT,false,8,0);}}
 sampler(program,name,unit,texture){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(program.u[name],unit);}
 mask(side,pupil){
  const gl=this.gl,p=this.warp,mesh=brightEyeMeshes[pupil?'pupil':side.side],texture=this.texture(null,200,200),R=side.ROI;this.target(texture,200,200);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(p.p);
  gl.uniformMatrix4fv(p.u.u_mvpMatrix,false,matrix(200,200));gl.uniform2fv(p.u.u_position_tl_point,new Float32Array(R.slice(0,2)));gl.uniform2fv(p.u.u_position_norm_vec,new Float32Array([F(1/R[2]),F(1/R[3])]));gl.uniform2f(p.u.u_roi_size,200,200);
  this.sampler(p,'s_material_texture',0,this.assets[pupil?'eye_pupil':side.side?'left_eye':'right_eye']);this.arrays(brightEyeFloatValues(side[pupil?'pupilBits':'worldBits']),brightEyeFloatValues(mesh.uvBits));gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh.indices),gl.STREAM_DRAW);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);gl.disable(gl.BLEND);return texture;
 }
 setFaces(faces,sourceWH){
  // Caches are immutable snapshots. Replace the array when restoring or identifying
  // another photo; editing ROI/grid/highlight in place is outside this API contract.
  if(faces===this.facesRef&&String(sourceWH)===this.sourceKey)return;
  const checked=validateBrightEyeFaces(faces,{sourceWH}),created=[],extraRows=[],start=new Set(this.textures);
  if(checked.some(face=>face.extra)&&!this.extraEye)throw Error('眼部遮罩需要图形设备支持九个纹理采样单元');
  try{for(const face of checked){if(face.extra)extraRows.push({texture:this.texture(decodeBrightEyeExtra(face.extra),256,256),projection:brightEyeFloatValues(face.extra.projectionBits),normalized:brightEyeFloatValues(face.extra.normalizedBits)});for(const side of [...face.sides].sort((a,b)=>b.side-a.side))created.push({...side,sourceWH:face.sourceWH,base:this.mask(side,false),pupil:this.mask(side,true),highlight:this.texture(decodeBrightEyeHighlight(side),200,200)});}}
  catch(error){for(const t of [...this.textures])if(!start.has(t))this.deleteTexture(t);throw error;}
  for(const row of this.rows)for(const key of ['base','pupil','highlight'])this.deleteTexture(row[key]);for(const row of this.extraRows)this.deleteTexture(row.texture);this.rows=created;this.extraRows=extraRows;this.facesRef=faces;this.sourceKey=String(sourceWH);this.extraGeneratedKey=null;
 }
 projectExtra(w,h){
  if(!this.extraRows.length)return null;const key=w+','+h;if(this.extraGeneratedKey===key)return this.scratch[3];
  const gl=this.gl,p=this.project,out=this.scratch[3],previous=this.scratch[4];this.target(out,w,h);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindBuffer(gl.ARRAY_BUFFER,this.projectQuad);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);gl.disableVertexAttribArray(1);gl.disableVertexAttribArray(2);gl.useProgram(p.p);
  for(const row of this.extraRows){this.target(out,w,h);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,previous);gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,w,h);this.target(out,w,h);this.sampler(p,'d',0,previous);this.sampler(p,'mq',1,row.texture);gl.uniformMatrix3fv(p.u.mr,false,row.projection);gl.uniform4f(p.u.ms,0,0,0,0);gl.scissor(...extraScissor(row.normalized,256,256,w,h));gl.enable(gl.SCISSOR_TEST);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.disable(gl.SCISSOR_TEST);}
  this.checkGL('亮眼眼部遮罩投影失败');this.extraGeneratedKey=key;return out;
 }
 copyFlip(source,target,w,h){
  const gl=this.gl,p=this.copy;this.target(target,w,h);gl.useProgram(p.p);gl.bindBuffer(gl.ARRAY_BUFFER,this.full);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);gl.disableVertexAttribArray(1);gl.disableVertexAttribArray(2);this.sampler(p,'source',0,source);gl.uniform2f(p.u.size,w,h);
  // Product DOM textures have opposite rows to the original numeric image axes.
  // Nearest sampling performs a lossless adapter before/after the original shader.
  const min=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER),mag=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER);
  try{gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
  finally{gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,min);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,mag);}
 }
 captureState(){
  const gl=this.gl,s={framebuffer:gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport:gl.getParameter(gl.VIEWPORT),program:gl.getParameter(gl.CURRENT_PROGRAM),array:gl.getParameter(gl.ARRAY_BUFFER_BINDING),element:gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),active:gl.getParameter(gl.ACTIVE_TEXTURE),color:gl.getParameter(gl.COLOR_WRITEMASK),clear:gl.getParameter(gl.COLOR_CLEAR_VALUE),equation:[gl.getParameter(gl.BLEND_EQUATION_RGB),gl.getParameter(gl.BLEND_EQUATION_ALPHA)],blend:[gl.getParameter(gl.BLEND_SRC_RGB),gl.getParameter(gl.BLEND_DST_RGB),gl.getParameter(gl.BLEND_SRC_ALPHA),gl.getParameter(gl.BLEND_DST_ALPHA)],pixel:[gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),gl.getParameter(gl.UNPACK_ALIGNMENT)],caps:[gl.DITHER,gl.BLEND,gl.SCISSOR_TEST,gl.DEPTH_TEST,gl.CULL_FACE].map(c=>[c,gl.isEnabled(c)]),textures:[],attributes:[]};
  s.vao=gl.getParameter(this.vaoExt.VERTEX_ARRAY_BINDING_OES);
  s.scissor=gl.getParameter(gl.SCISSOR_BOX);
  for(let i=0;i<this.textureUnitCount;i++){gl.activeTexture(gl.TEXTURE0+i);s.textures.push(gl.getParameter(gl.TEXTURE_BINDING_2D));}gl.activeTexture(s.active);
  for(let i=0;i<2;i++)s.attributes.push({enabled:gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_ENABLED),buffer:gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),size:gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_SIZE),type:gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_TYPE),normalized:gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_NORMALIZED),stride:gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_STRIDE),offset:gl.getVertexAttribOffset(i,gl.VERTEX_ATTRIB_ARRAY_POINTER)});return s;
 }
 restoreState(s){
  const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,s.framebuffer);gl.viewport(...s.viewport);gl.useProgram(s.program);gl.colorMask(...s.color);gl.clearColor(...s.clear);gl.blendEquationSeparate(...s.equation);gl.blendFuncSeparate(...s.blend);for(const [cap,enabled]of s.caps)enabled?gl.enable(cap):gl.disable(cap);
  gl.scissor(...s.scissor);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,s.pixel[0]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,s.pixel[1]);gl.pixelStorei(gl.UNPACK_ALIGNMENT,s.pixel[2]);for(let i=0;i<s.textures.length;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,s.textures[i]);}gl.activeTexture(s.active);
  this.vaoExt.bindVertexArrayOES(s.vao);gl.bindBuffer(gl.ARRAY_BUFFER,s.array);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,s.element);
 }
 render(source,params,w,h,{faces=[],sourceWH}={}){
  if(this.disposed)throw Error('亮眼渲染器已释放');const weights=[brightEyeWeights(params,0),brightEyeWeights(params,1)];if(!faces.length||!weights.some(v=>v.active))return source;
  if(![w,h].every(n=>Number.isSafeInteger(n)&&n>0&&n<=this.maxSize))throw Error('亮眼照片超过图形设备尺寸上限');
  const gl=this.gl,state=this.captureState();
  try{
   this.vaoExt.bindVertexArrayOES(this.vao);for(const cap of [gl.DITHER,gl.BLEND,gl.SCISSOR_TEST,gl.DEPTH_TEST,gl.CULL_FACE])gl.disable(cap);gl.colorMask(true,true,true,true);this.setFaces(faces,sourceWH);if(!this.rows.some(row=>weights[row.side].active))return source;
   if(this.width!==w||this.height!==h||(this.extraRows.length&&!this.storageHasExtra)){this.extraGeneratedKey=null;gl.activeTexture(gl.TEXTURE0);try{const allocateExtra=this.extraRows.length>0;for(const t of this.scratch.slice(0,allocateExtra?5:3)){gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.checkGL('亮眼输出纹理分配失败，请缩小照片或重新打开应用');}this.width=w;this.height=h;this.storageHasExtra=allocateExtra;}catch(error){this.width=0;this.height=0;this.storageHasExtra=false;throw error;}}
   const extra=this.projectExtra(w,h);
   this.copyFlip(source,this.scratch[0],w,h);let current=this.scratch[0],other=this.scratch[1];
   for(const row of this.rows){const v=weights[row.side];if(!v.active)continue;
    this.target(current,w,h);gl.bindTexture(gl.TEXTURE_2D,other);gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,w,h);this.target(other,w,h);const p=extra?this.extraEye:this.eye;gl.useProgram(p.p);
    const [x,y,rw,rh]=row.ROI,sx=F(w/row.sourceWH[0]),sy=F(h/row.sourceWH[1]),x0=F(F(x)*sx),x1=F(F(x+rw)*sx),y0=F(F(y)*sy),y1=F(F(y+rh)*sy);this.arrays(new Float32Array([x0,y1,x1,y1,x0,y0,x1,y0]),maskUV);gl.uniformMatrix4fv(p.u.u_mvpMatrix,false,matrix(w,h));
    if(extra){const ix=F(1/F(w)),iy=F(1/F(h));gl.bindBuffer(gl.ARRAY_BUFFER,this.extraUV);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([F(x0*ix),F(y1*iy),F(x1*ix),F(y1*iy),F(x0*ix),F(y0*iy),F(x1*ix),F(y0*iy)]),gl.STREAM_DRAW);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,8,0);this.sampler(p,'s_extra_mask_texture',8,extra);}
    [current,row.base,row.pupil,this.assets.whiteCurve,this.assets.pupilCurve,this.assets.ly,row.highlight,this.assets.highlightCurve].forEach((t,i)=>this.sampler(p,['s_src_texture','s_mask_texture','s_pupil_mask_texture','s_white_area_lut_texture','s_pupil_other_lut_texture','s_pupil_sat_lut_texture','s_pupil_highlight_mask_texture','s_pupil_highlight_lut_texture'][i],i,t));
    const values={u_sharp_width_offset:F(8/w),u_sharp_height_offset:F(8/h),u_sharp_threshold:F(13/255),u_sharp_factor:F(2.11),u_alpha:v.master,u_white_area_alpha:v.white,u_pupil_other_alpha:v.other,u_pupil_other_sharp_alpha:v.sharp,u_pupil_highlight_alpha:v.high,u_pupil_sat_alpha:v.saturation};for(const [name,value]of Object.entries(values))gl.uniform1f(p.u[name],value);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);[current,other]=[other,current];
   }
   this.copyFlip(current,this.scratch[2],w,h);if(gl.isContextLost())throw Error('亮眼图形处理已中断');this.checkGL('亮眼图形处理失败，请重新识别或缩小照片');return this.scratch[2];
  }finally{this.restoreState(state);}
 }
 dispose(){if(this.disposed)return;const gl=this.gl;for(const t of this.textures)gl.deleteTexture(t);for(const b of this.buffers)gl.deleteBuffer(b);for(const p of this.programs)gl.deleteProgram(p);for(const f of this.framebuffers)gl.deleteFramebuffer(f);if(this.vao)this.vaoExt.deleteVertexArrayOES(this.vao);this.textures.clear();this.buffers.clear();this.programs.clear();this.framebuffers.clear();this.rows=[];this.extraRows=[];this.extraGeneratedKey=null;this.facesRef=null;this.disposed=true;}
}
