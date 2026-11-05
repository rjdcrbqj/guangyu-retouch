const vertex=`attribute vec2 a_position;varying vec2 uv;void main(){uv=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}`;
// 标准 HSL 转换与连续色段插值；温度、色调使用独立通道增益。
const fragment=`precision highp float;varying vec2 uv;uniform sampler2D sourceTex;
uniform vec3 bands[8];uniform float centers[8];uniform vec2 balance;uniform float mode;
vec3 fromHSL(vec3 hsl){vec3 wave=clamp(abs(mod(hsl.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);return hsl.z+(wave-.5)*(1.0-abs(2.0*hsl.z-1.0))*hsl.y;}
void main(){vec4 original=texture2D(sourceTex,uv);vec3 c=original.rgb;
 if(mode<.5){
  float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),d=hi-lo,l=(hi+lo)*.5;
  if(d>0.00001){float h;if(hi==c.r)h=mod((c.g-c.b)/d,6.0);else if(hi==c.g)h=(c.b-c.r)/d+2.0;else h=(c.r-c.g)/d+4.0;h=fract(h/6.0+1.0);
   vec3 adjustment=vec3(0.0);for(int i=0;i<8;i++){float start=centers[i],end;if(i==7)end=1.0;else end=centers[i+1];if(h>=start&&h<end){float t=(h-start)/(end-start);if(i==7)adjustment=mix(bands[i],bands[0],t);else adjustment=mix(bands[i],bands[i+1],t);}}
   if(dot(abs(adjustment),vec3(1.0))>0.0){float s=d/(1.0-abs(2.0*l-1.0));s=adjustment.y<0.0?s*(1.0+adjustment.y):s+(1.0-s)*adjustment.y;
    l=adjustment.z<0.0?l*(1.0+adjustment.z*.5):l+(1.0-l)*adjustment.z*.5;c=fromHSL(vec3(fract(h+adjustment.x/12.0+1.0),clamp(s,0.0,1.0),l));}
  }
 }else{c*=exp2(vec3(balance.x*.35+balance.y*.15,-balance.y*.2,-balance.x*.35+balance.y*.15));}
 gl_FragColor=vec4(clamp(c,0.0,1.0),original.a);}`;
// 保留引擎接口；独立公式不需要任何静态表或浮点纹理扩展。
export class NativeColorTables{dispose(){}}
export class NativeColorPipeline{
 constructor(gl,buffer,kind){
  if(!['hsl','tempTint'].includes(kind))throw Error('调色类型无效');this.gl=gl;this.buffer=buffer;this.kind=kind;const shaders=[];
  try{this.program=gl.createProgram();for(const [type,code]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(this.program,s);}gl.bindAttribLocation(this.program,0,'a_position');gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
   this.u=Object.fromEntries(['sourceTex','bands[0]','centers[0]','balance','mode'].map(k=>[k,gl.getUniformLocation(this.program,k)]));this.texture=gl.createTexture();this.framebuffer=gl.createFramebuffer();if(!this.texture||!this.framebuffer)throw Error('调色图形资源不足');
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
  }catch(error){this.dispose();throw error;}finally{shaders.forEach(s=>gl.deleteShader(s));}
 }
 render(source,p,w,h){
  const hsl=this.kind==='hsl';if(!p[hsl?'hslEnabled':'tempTintEnabled'])return source;
  const values=Array.from({length:8},(_,i)=>['Hue','Saturation','Luma'].map(t=>(Number(p['hsl'+t+i])||0)/100)).flat(),temperature=(Number(p.relativeTemperature)||0)/100,tint=(Number(p.relativeTint)||0)/100;
  if(hsl?values.every(v=>v===0):temperature===0&&tint===0)return source;
  const gl=this.gl,previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),dither=gl.isEnabled(gl.DITHER),blend=gl.isEnabled(gl.BLEND);
  try{gl.disable(gl.DITHER);gl.disable(gl.BLEND);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.viewport(0,0,w,h);
   gl.uniform1i(this.u.sourceTex,0);gl.uniform1f(this.u.mode,hsl?0:1);gl.uniform3fv(this.u['bands[0]'],new Float32Array(values));gl.uniform1fv(this.u['centers[0]'],new Float32Array([0,1/12,1/6,1/3,1/2,2/3,3/4,5/6]));gl.uniform2f(this.u.balance,temperature,tint);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);if(this.width!==w||this.height!==h){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.width=w;this.height=h;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('调色输出不可用');gl.bindTexture(gl.TEXTURE_2D,source);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.texture;
  }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous);if(dither)gl.enable(gl.DITHER);if(blend)gl.enable(gl.BLEND);}
 }
 dispose(){const gl=this.gl;if(this.texture)gl.deleteTexture(this.texture);if(this.framebuffer)gl.deleteFramebuffer(this.framebuffer);if(this.program)gl.deleteProgram(this.program);}
}
