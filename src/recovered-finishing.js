// 原始资源、字节校验和适用边界见 docs/批量细节证据.json。
// 参数范围/初值/组合顺序是本软件设计；不是已验证的原版 UI 映射。
export const finishingParamSpecs = Object.freeze([
 {key:'dispersion',label:'色散距离（原图像素）',min:0,max:30,step:1,default:0},
 {key:'dispersionAngle',label:'色散方向（度）',min:-180,max:180,step:1,default:0},
 {key:'medianDenoise',label:'中值去噪',min:0,max:100,step:1,default:0},
 {key:'grayNoise',label:'灰度颗粒',min:0,max:100,step:1,default:0},
 {key:'grayNoiseDark',label:'暗部灰度颗粒',min:0,max:100,step:1,default:0},
 {key:'colorNoise',label:'彩色颗粒',min:0,max:100,step:1,default:0},
 {key:'colorNoiseDark',label:'暗部彩色颗粒',min:0,max:100,step:1,default:0},
 {key:'desharpen',label:'反锐化',min:0,max:100,step:1,default:0},
 {key:'desharpenRadius',label:'反锐化半径（原图像素）',min:1,max:8,step:1,default:2},
 {key:'pixelate',label:'像素化强度',min:0,max:100,step:1,default:0},
 {key:'pixelateBlocks',label:'像素化每轴块数',min:4,max:256,step:1,default:64},
 {key:'motionBlur',label:'运动模糊',min:0,max:100,step:1,default:0},
 {key:'motionAngle',label:'运动方向（度）',min:-180,max:180,step:1,default:0},
 {key:'radialBlur',label:'径向模糊',min:0,max:100,step:1,default:0},
 {key:'rotateBlur',label:'旋转模糊',min:0,max:100,step:1,default:0},
 {key:'blurCenterX',label:'模糊中心 X（%）',min:0,max:100,step:1,default:50},
 {key:'blurCenterY',label:'模糊中心 Y（%）',min:0,max:100,step:1,default:50},
 {key:'blurProtectRadius',label:'中心保护半径（%）',min:0,max:100,step:1,default:15}
].map(spec=>Object.freeze({...spec,group:'local'})));

export const recoveredFinishingGLSL = `
vec3 recoveredColorDispersion(sampler2D source,vec2 coord,vec2 offsetR,vec2 offsetG,vec2 offsetB){
 return vec3(texture2D(source,coord+offsetR).r,texture2D(source,coord+offsetG).g,texture2D(source,coord+offsetB).b);
}
void finishingSwap(inout vec3 a,inout vec3 b){vec3 t=a;a=min(a,b);b=max(t,b);}
vec3 recoveredMedian3x3(sampler2D source,vec2 coord,vec2 stepSize){
 vec3 v0=texture2D(source,coord+vec2(-stepSize.x,-stepSize.y)).rgb;
 vec3 v1=texture2D(source,coord+vec2(0.0,-stepSize.y)).rgb;
 vec3 v2=texture2D(source,coord+vec2(stepSize.x,-stepSize.y)).rgb;
 vec3 v3=texture2D(source,coord+vec2(-stepSize.x,0.0)).rgb;
 vec3 v4=texture2D(source,coord).rgb;
 vec3 v5=texture2D(source,coord+vec2(stepSize.x,0.0)).rgb;
 finishingSwap(v0,v3);finishingSwap(v1,v4);finishingSwap(v2,v5);
 finishingSwap(v0,v1);finishingSwap(v0,v2);finishingSwap(v4,v5);finishingSwap(v3,v5);
 v5=texture2D(source,coord+vec2(-stepSize.x,stepSize.y)).rgb;
 finishingSwap(v1,v2);finishingSwap(v3,v4);finishingSwap(v1,v3);finishingSwap(v1,v5);finishingSwap(v4,v5);finishingSwap(v2,v5);
 v5=texture2D(source,coord+vec2(0.0,stepSize.y)).rgb;
 finishingSwap(v2,v3);finishingSwap(v4,v5);finishingSwap(v2,v4);finishingSwap(v3,v5);
 v5=texture2D(source,coord+vec2(stepSize.x,stepSize.y)).rgb;
 finishingSwap(v4,v5);finishingSwap(v3,v5);finishingSwap(v3,v4);
 return v4;
}
float finishingHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 recoveredGrayNoise(vec3 color,vec2 pixel,float light,float dark){
 float y=dot(color,vec3(0.299,0.587,0.114));
 float n1=(finishingHash(pixel)-0.5)*light/255.0;
 float n2=(finishingHash(pixel*1.37)-0.5)*dark/255.0*(1.0-y);
 return clamp(color+n1+n2,0.0,1.0);
}
vec3 recoveredColorNoise(vec3 color,vec2 pixel,float light,float dark){
 float y=dot(color,vec3(0.299,0.587,0.114));
 vec3 n1=vec3(finishingHash(pixel+vec2(0.11,0.23)),finishingHash(pixel*1.37+vec2(0.43,0.17)),finishingHash(pixel*1.79+vec2(0.29,0.61)))-0.5;
 vec3 n2=vec3(finishingHash(pixel*2.13+vec2(0.71,0.37)),finishingHash(pixel*2.71+vec2(0.19,0.83)),finishingHash(pixel*3.17+vec2(0.53,0.47)))-0.5;
 return clamp(color+n1*(light/255.0)+n2*(dark/255.0)*(1.0-y),0.0,1.0);
}
vec3 recoveredDesharpen(sampler2D source,vec2 coord,vec2 pixelStep,float radiusValue,float amount){
 int R=int(radiusValue+0.5);if(R<1)R=1;if(R>8)R=8;
 float sigma1=float(R),sigma2=sigma1*1.41421356;
 float inv1=1.0/(2.0*sigma1*sigma1),inv2=1.0/(2.0*sigma2*sigma2);
 float r1=float(R*R),r2max=2.0*r1,w1sum=0.0,w2sum=0.0;
 vec3 sum1=vec3(0.0),sum2=vec3(0.0);
 for(int y=-12;y<=12;y++){for(int x=-12;x<=12;x++){
  float r2=float(x*x+y*y);float w1=r2>r1?0.0:exp(-r2*inv1);float w2=r2>r2max?0.0:exp(-r2*inv2);
  if(w1+w2==0.0)continue;
  vec3 c=texture2D(source,coord+vec2(float(x),float(y))*pixelStep).rgb;
  sum1+=c*w1;sum2+=c*w2;w1sum+=w1;w2sum+=w2;
 }}
 return mix(texture2D(source,coord).rgb,2.0*sum1/w1sum-sum2/w2sum,amount);
}
vec4 recoveredPixelated(sampler2D source,vec2 coord,float blocks){
 return texture2D(source,(floor(coord*blocks)+0.5)/blocks);
}
// 固定 32 个样本；无主体保护、径向保护纹理和渐变分支。选区混合由调用者提供。
vec3 recoveredMotionBlur(sampler2D source,vec2 coord,vec2 motion,float amount){
 vec3 sum=vec3(0.0);float weights=0.0;
 for(int i=-16;i<16;i++){
  float weight=1.0-abs(float(i))/32.0;
  sum+=texture2D(source,coord+motion*float(i)*amount/32.0).rgb*weight;weights+=weight;
 }
 return sum/weights;
}
float finishingCenterDistance(vec2 coord,vec2 center,float aspect){
 if(aspect>1.0){coord.x*=aspect;center.x*=aspect;}else{coord.y/=aspect;center.y/=aspect;}
 return distance(coord,center);
}
vec3 recoveredRadialBlur(sampler2D source,vec2 coord,vec2 center,float aspect,float radius,float amount){
 float d=finishingCenterDistance(coord,center,aspect)-radius;
 if(d<=0.0)return texture2D(source,coord).rgb;
 vec2 direction=normalize(coord-center);vec3 sum=vec3(0.0);
 for(int i=0;i<32;i++){
  vec2 q=clamp(coord-direction*d*float(i)*amount/32.0,vec2(0.0),vec2(1.0));
  sum+=texture2D(source,q).rgb/32.0;
 }
 return sum;
}
// 默认分支：未启用 LINEARBLUR / PERFECTCIRCLE，与原文件宏关闭的计算相同。
vec3 recoveredRotateBlur(sampler2D source,vec2 coord,vec2 center,float aspect,float radius,float amount){
 float d=finishingCenterDistance(coord,center,aspect)-radius;
 if(d<0.0)return texture2D(source,coord).rgb;
 vec2 offset=coord-center;vec3 sum=vec3(0.0);
 for(int i=0;i<32;i++){
  float angle=float(i)*amount*d/32.0;
  vec2 rotated=vec2(cos(angle)*offset.x-sin(angle)*offset.y,sin(angle)*offset.x+cos(angle)*offset.y);
  sum+=texture2D(source,center+rotated).rgb/32.0;
 }
 return sum;
}
`;
