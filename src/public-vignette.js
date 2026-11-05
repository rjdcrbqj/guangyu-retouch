// 自主径向暗角，不携带原曲线或原着色程序；旧工程字段保持不变。
export const vignetteSpecs=Object.freeze([
 ['vignetteAmount','暗角强度',-100,100,0],['vignetteMidpoint','中心范围',0,100,50],
 ['vignetteRoundness','圆度',-100,100,0],['vignetteFeather','羽化',0,100,50],
 ['vignetteHighlights','高光保护',0,100,0]
].map(([key,label,min,max,value])=>({key,label,min,max,step:1,default:value,group:'basic'})));
const vertex=`attribute vec2 a_position;varying vec2 uv;void main(){uv=(a_position+1.0)*.5;gl_Position=vec4(a_position,0.0,1.0);}`;
const fragment=`precision highp float;varying vec2 uv;uniform sampler2D sourceTex;uniform vec4 controls;uniform float highlights;uniform vec2 dimensions;
void main(){vec4 source=texture2D(sourceTex,uv);vec2 p=abs(uv*2.0-1.0);
 float ellipse=length(p)/sqrt(2.0),circle=length(p*dimensions)/length(dimensions),square=max(p.x,p.y);
 float distance=controls.z>=0.0?mix(ellipse,circle,controls.z):mix(ellipse,square,-controls.z);
 float inner=.1+controls.y*.7,outer=min(1.0,inner+.02+controls.w*.65);
 float coverage=smoothstep(inner,outer,distance)*abs(controls.x)*.8;
 vec3 result;if(controls.x<0.0){float bright=smoothstep(.5,1.0,max(source.r,max(source.g,source.b)));result=source.rgb*(1.0-coverage*(1.0-highlights*bright));}
 else result=source.rgb+(1.0-source.rgb)*coverage;
 gl_FragColor=vec4(result,source.a);}`;
export class VignettePipeline{
 constructor(gl,buffer){
  this.gl=gl;this.buffer=buffer;const shaders=[];
  try{this.program=gl.createProgram();for(const [type,code]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(this.program,s);}gl.bindAttribLocation(this.program,0,'a_position');gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
   this.u=Object.fromEntries(['sourceTex','controls','highlights','dimensions'].map(k=>[k,gl.getUniformLocation(this.program,k)]));this.texture=gl.createTexture();this.framebuffer=gl.createFramebuffer();if(!this.texture||!this.framebuffer)throw Error('暗角图形资源不足');
  }catch(error){this.dispose();throw error;}finally{shaders.forEach(s=>gl.deleteShader(s));}
 }
 render(source,p,w,h,originalWidth,originalHeight){
  if(!p.vignetteAmount)return source;const gl=this.gl,previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),dither=gl.isEnabled(gl.DITHER),blend=gl.isEnabled(gl.BLEND);
  try{gl.disable(gl.DITHER);gl.disable(gl.BLEND);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.viewport(0,0,w,h);gl.uniform1i(this.u.sourceTex,0);gl.uniform4f(this.u.controls,p.vignetteAmount/100,p.vignetteMidpoint/100,p.vignetteRoundness/100,p.vignetteFeather/100);gl.uniform1f(this.u.highlights,p.vignetteHighlights/100);gl.uniform2f(this.u.dimensions,originalWidth,originalHeight);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);if(this.width!==w||this.height!==h){for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.width=w;this.height=h;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('暗角输出不可用');gl.bindTexture(gl.TEXTURE_2D,source);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.texture;
  }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous);if(dither)gl.enable(gl.DITHER);if(blend)gl.enable(gl.BLEND);}
 }
 dispose(){const gl=this.gl;if(this.texture)gl.deleteTexture(this.texture);if(this.framebuffer)gl.deleteFramebuffer(this.framebuffer);if(this.program)gl.deleteProgram(this.program);}
}
