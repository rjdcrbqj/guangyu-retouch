// 自主颜色公式，无外部纹理或查找表；旧工程字段保持稳定。
export const nativeTeethSpecs=Object.freeze([
 {key:'nativeTeethEnabled',label:'应用牙齿美白',min:0,max:1,step:1,default:0,group:'teeth'},
 {key:'nativeTeethMaster',label:'总强度',min:0,max:100,step:1,default:100,group:'teeth'},
 {key:'nativeTeethWhiten',label:'祛黄',min:0,max:100,step:1,default:50,group:'teeth'},
 {key:'nativeTeethBright',label:'明度',min:0,max:100,step:1,default:50,group:'teeth'}
]);
export const maskVertex=`
attribute vec2 a_position; attribute vec2 a_texcoord;
uniform mat4 u_mvpMatrix; uniform mat3 u_mvpMaskMatrix;
varying vec2 maskUV;
void main(){maskUV=(u_mvpMaskMatrix*vec3(a_texcoord,1.0)).xy;gl_Position=u_mvpMatrix*vec4(a_position,0.0,1.0);}`;
export const maskFragment=`
precision highp float;
uniform sampler2D s_mask; uniform float u_whiten; uniform float u_bright;
varying vec2 maskUV;
void main(){float inside=step(0.0,maskUV.x)*step(maskUV.x,1.0)*step(0.0,maskUV.y)*step(maskUV.y,1.0);
float coverage=texture2D(s_mask,maskUV).g*inside;
gl_FragColor=vec4(coverage*u_whiten,coverage*u_bright,0.0,0.0);}`;
export const teethVertex=`
attribute vec2 a_position; attribute vec2 a_texcoord;
varying vec2 uv;
void main(){uv=a_texcoord;gl_Position=vec4(a_position,0.0,1.0);}`;
export const teethFragment=`
precision highp float;
uniform sampler2D s_src_texture; uniform sampler2D s_mask_texture;
varying vec2 uv;
void main(){
 vec4 source=texture2D(s_src_texture,uv);
 vec2 amount=clamp(texture2D(s_mask_texture,uv).rg,0.0,1.0);
 // 蓝色与红绿均值的差代表黄色，沿恒亮度方向削减，保留纹理。
 float yellow=max(0.0,(source.r+source.g)*0.5-source.b);
 float blueLift=yellow*0.7*amount.x;
 vec3 color=source.rgb+vec3(-0.0722/0.9278*blueLift,-0.0722/0.9278*blueLift,blueLift);
 // 三通道同量提亮，接近高光时由剩余空间限制，避免削平高光。
 float headroom=1.0-max(color.r,max(color.g,color.b));
 color+=vec3(headroom*0.45*amount.y);
 gl_FragColor=vec4(clamp(color,0.0,1.0),source.a);
}`;
