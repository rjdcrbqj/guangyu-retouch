// 自主实现的通用图像公式。无需原软件着色器、模板、曲线或模型。
const spec=(key,label,min,max,value=0,group='local')=>({key,label,min,max,step:1,default:value,group});
export const adjustmentSpecs=Object.freeze(['','local'].flatMap(prefix=>[
 spec(prefix?'localFade':'fadeAmount',prefix?'局部褪色（%）':'褪色（%）',0,100,0,prefix?'local':'basic'),
 spec(prefix?'localHue':'hueRotation',prefix?'局部色相（°）':'色相旋转（°）',-180,180,0,prefix?'local':'basic'),
 spec(prefix?'localBlackWhite':'blackWhiteAmount',prefix?'局部黑白（%）':'黑白（%）',0,100,0,prefix?'local':'basic')
]));
export const finishingParamSpecs=Object.freeze([
 spec('dispersion','色散距离（原图像素）',0,30),spec('dispersionAngle','色散方向（度）',-180,180),
 ...[['medianDenoise','中值去噪'],['grayNoise','灰度颗粒'],['grayNoiseDark','暗部灰度颗粒'],['colorNoise','彩色颗粒'],['colorNoiseDark','暗部彩色颗粒'],['desharpen','反锐化']].map(([key,label])=>spec(key,label,0,100)),
 spec('desharpenRadius','反锐化半径（原图像素）',1,8,2),spec('pixelate','像素化强度',0,100),spec('pixelateBlocks','像素化每轴块数',4,256,64),
 spec('motionBlur','运动模糊',0,100),spec('motionAngle','运动方向（度）',-180,180),spec('radialBlur','径向模糊',0,100),spec('rotateBlur','旋转模糊',0,100),
 spec('blurCenterX','模糊中心 X（%）',0,100,50),spec('blurCenterY','模糊中心 Y（%）',0,100,50),spec('blurProtectRadius','中心保护半径（%）',0,100,15)
]);
export const publicColorGLSL=`
vec3 publicContrast(vec3 c,float amount,float pivot){return clamp((c-vec3(pivot))*(1.0+amount)+vec3(pivot),0.0,1.0);}
vec3 publicVibrance(vec3 c,float amount){float l=dot(c,vec3(.2126,.7152,.0722));float chroma=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b));float gain=1.0+amount*(1.0-chroma);return clamp(mix(vec3(l),c,gain),0.0,1.0);}
`;
export const publicAdjustmentsGLSL=`
vec3 publicAdjustments(vec3 c,float fade,float hue,float bw){
 // 绕灰轴旋转色相；Rodrigues 旋转公式保留灰色及周期性。
 float a=radians(hue),cs=cos(a),sn=sin(a);vec3 axis=vec3(.57735026919);
 vec3 turned=c*cs+cross(axis,c)*sn+axis*dot(axis,c)*(1.0-cs);
 c=clamp(turned,0.0,1.0);c=mix(c,vec3(.14)+c*.78,fade/100.0);
 return mix(c,vec3(dot(c,vec3(.2126,.7152,.0722))),bw/100.0);
}
`;
export const publicSharpenGLSL=`
vec3 publicUSM(sampler2D source,vec2 uv,vec2 pixel,float radius,float amount){
 vec3 c=texture2D(source,uv).rgb,sum=vec3(0.0);float weights=0.0;
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 q=vec2(float(x),float(y));float weight=exp(-dot(q,q)*.5);sum+=texture2D(source,uv+q*pixel*radius*.5).rgb*weight;weights+=weight;}
 return clamp(c+(c-sum/weights)*amount,0.0,1.0);
}
`;
// 展开中值排序以兼容 WebGL 1 对数组动态索引的限制。
const medianSamples=Array.from({length:9},(_,i)=>`vec3 m${i}=texture2D(source,uv+vec2(${i%3-1}.0,${Math.floor(i/3)-1}.0)*pixel).rgb;`).join('\n');
const medianSort=Array.from({length:8},(_,i)=>Array.from({length:8-i},(_,k)=>{const j=i+k+1;return `low=min(m${i},m${j});m${j}=max(m${i},m${j});m${i}=low;`;}).join('\n')).join('\n');
export const publicFinishingGLSL=`
vec3 publicColorDispersion(sampler2D source,vec2 uv,vec2 red,vec2 green,vec2 blue){return vec3(texture2D(source,uv+red).r,texture2D(source,uv+green).g,texture2D(source,uv+blue).b);}
vec3 publicMedian3x3(sampler2D source,vec2 uv,vec2 pixel){${medianSamples}vec3 low;${medianSort}return m4;}
float publicNoiseHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
vec3 publicGrayNoise(vec3 c,vec2 pixel,float light,float dark){float l=dot(c,vec3(.2126,.7152,.0722));float amount=(light+dark*(1.0-l))/100.0;return clamp(c+vec3((publicNoiseHash(pixel)-.5)*amount*.28),0.0,1.0);}
vec3 publicColorNoise(vec3 c,vec2 pixel,float light,float dark){float l=dot(c,vec3(.2126,.7152,.0722));float amount=(light+dark*(1.0-l))/100.0;vec3 n=vec3(publicNoiseHash(pixel),publicNoiseHash(pixel+vec2(19.,37.)),publicNoiseHash(pixel+vec2(53.,11.)))-.5;return clamp(c+n*amount*.28,0.0,1.0);}
vec3 publicDesharpen(sampler2D source,vec2 uv,vec2 pixel,float radius,float amount){vec3 sum=vec3(0.0);float weights=0.0;for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 q=vec2(float(x),float(y));float weight=exp(-dot(q,q)*.5);sum+=texture2D(source,uv+q*pixel*radius*.5).rgb*weight;weights+=weight;}return mix(texture2D(source,uv).rgb,sum/weights,amount);}
vec4 publicPixelated(sampler2D source,vec2 uv,float blocks){return texture2D(source,(floor(uv*blocks)+.5)/blocks);}
vec3 publicMotionBlur(sampler2D source,vec2 uv,vec2 direction,float amount){vec3 sum=vec3(0.0);for(int i=-6;i<=6;i++)sum+=texture2D(source,uv+direction*amount*float(i)/12.0).rgb;return sum/13.0;}
float publicCenterWeight(vec2 uv,vec2 center,float aspect,float radius){return smoothstep(radius,radius+.12,length((uv-center)*vec2(aspect,1.0)));}
vec3 publicRadialBlur(sampler2D source,vec2 uv,vec2 center,float aspect,float radius,float amount){vec3 sum=vec3(0.0);float weight=publicCenterWeight(uv,center,aspect,radius);for(int i=-6;i<=6;i++)sum+=texture2D(source,uv+(uv-center)*float(i)*amount*weight*.0125).rgb;return sum/13.0;}
vec3 publicRotateBlur(sampler2D source,vec2 uv,vec2 center,float aspect,float radius,float amount){vec2 delta=(uv-center)*vec2(aspect,1.0);float weight=publicCenterWeight(uv,center,aspect,radius);vec3 sum=vec3(0.0);for(int i=-6;i<=6;i++){float a=float(i)*amount*weight*.0125,cs=cos(a),sn=sin(a);vec2 q=vec2(delta.x*cs-delta.y*sn,delta.x*sn+delta.y*cs);sum+=texture2D(source,center+q/vec2(aspect,1.0)).rgb;}return sum/13.0;}
`;
