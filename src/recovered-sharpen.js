// 来源：原资源 glsl/PaintFX/USM.frag 的小半径圆形高斯分支。
// 外部预模糊的大半径路径未接入；与其他效果的先后顺序由本软件确定。
export const recoveredSharpenGLSL=`
vec3 recoveredUSM(sampler2D source,vec2 coord,vec2 pixelStep,float radiusValue,float amountValue){
 vec3 original=texture2D(source,coord).rgb;
 int R=int(radiusValue+0.5);if(R<1)R=1;if(R>12)R=12;
 float sigma=float(R),inv2s2=1.0/(2.0*sigma*sigma),weightSum=0.0;vec3 sum=vec3(0.0);
 for(int y=-12;y<=12;y++){
  if(y < -R || y > R)continue;
  for(int x=-12;x<=12;x++){
   if(x < -R || x > R)continue;
   float distance2=float(x*x+y*y);if(distance2>float(R*R))continue;
   float weight=exp(-distance2*inv2s2);
   sum+=texture2D(source,coord+vec2(float(x),float(y))*pixelStep).rgb*weight;weightSum+=weight;
  }
 }
 return clamp(original+amountValue*(original-sum/weightSum),0.0,1.0);
}`;
