import {recoveredFinishingGLSL,finishingParamSpecs} from './recovered-finishing.js';
const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}`;
const fragment=`precision highp float;varying vec2 uv;uniform sampler2D sourceTex,maskTex;uniform vec2 texel;uniform float aspect,stage,finishingScope;
${finishingParamSpecs.map(s=>'uniform float '+s.key+';').join('\n')}
${recoveredFinishingGLSL}
void main(){
 vec4 source=texture2D(sourceTex,uv);vec3 c=source.rgb;float angle=motionAngle*0.017453292519943295;vec2 center=vec2(blurCenterX/100.0,1.0-blurCenterY/100.0);
 if(stage<0.5)c=mix(c,recoveredPixelated(sourceTex,uv,pixelateBlocks).rgb,pixelate/100.0);
 else if(stage<1.5)c=mix(c,recoveredMedian3x3(sourceTex,uv,texel),medianDenoise/100.0);
 else if(stage<2.5)c=recoveredDesharpen(sourceTex,uv,texel,desharpenRadius,desharpen/100.0);
 else if(stage<3.5)c=recoveredMotionBlur(sourceTex,uv,vec2(cos(angle)/aspect,sin(angle)),motionBlur/100.0*0.2);
 else if(stage<4.5)c=recoveredRadialBlur(sourceTex,uv,center,aspect,blurProtectRadius/100.0,radialBlur/100.0);
 else if(stage<5.5)c=recoveredRotateBlur(sourceTex,uv,center,aspect,blurProtectRadius/100.0,rotateBlur/100.0);
 else {float a=dispersionAngle*0.017453292519943295;vec2 d=vec2(cos(a),sin(a))*dispersion*texel;c=recoveredColorDispersion(sourceTex,uv,d,vec2(0.0),-d);}
 float weight=finishingScope>0.5?1.0:texture2D(maskTex,uv).a;
 gl_FragColor=vec4(mix(source.rgb,clamp(c,0.0,1.0),weight),source.a);
}`;
const stages=['pixelate','medianDenoise','desharpen','motionBlur','radialBlur','rotateBlur','dispersion'];
// Two offscreen buffers compose active effects in order without replacing earlier results.
// Stage order, slider mapping, source-alpha preservation and mask mix are integration choices.
export class FinishingPipeline {
 constructor(gl,buffer){
  this.gl=gl;this.buffer=buffer;const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
  const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.bindAttribLocation(program,0,'position');gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));this.program=program;
  this.uniforms=Object.fromEntries(['sourceTex','maskTex','texel','aspect','stage','finishingScope',...finishingParamSpecs.map(s=>s.key)].map(k=>[k,gl.getUniformLocation(program,k)]));
  this.targets=[0,1].map(()=>({texture:gl.createTexture(),framebuffer:gl.createFramebuffer()}));
 }
 render(source,mask,p,w,h,originalWidth,originalHeight){
  if(!stages.some(k=>p[k]>0))return source;
  const gl=this.gl,u=this.uniforms;gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.viewport(0,0,w,h);
  gl.uniform1i(u.sourceTex,0);gl.uniform1i(u.maskTex,1);gl.uniform2f(u.texel,1/originalWidth,1/originalHeight);gl.uniform1f(u.aspect,originalWidth/originalHeight);gl.uniform1f(u.finishingScope,p.finishingScope);
  for(const spec of finishingParamSpecs)gl.uniform1f(u[spec.key],p[spec.key]);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mask);
  let input=source,pass=0;
  try{for(let index=0;index<stages.length;index++){
   if(p[stages[index]]<=0)continue;
   const target=this.targets[pass++%2];gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,target.texture);
   if(target.width!==w||target.height!==h){
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);target.width=w;target.height=h;
   }
   gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('细节处理缓冲区创建失败。');
   gl.bindTexture(gl.TEXTURE_2D,input);gl.uniform1f(u.stage,index);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);input=target.texture;
  }return input;}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
 }
 dispose(){for(const target of this.targets){this.gl.deleteTexture(target.texture);this.gl.deleteFramebuffer(target.framebuffer);}this.gl.deleteProgram(this.program);}
}
