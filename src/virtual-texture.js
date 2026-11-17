// 所有照片着色阶段使用同一全图坐标；蒙版及局部缓存仍是独立普通纹理。
const glsl=`
uniform float gyPacked;uniform vec2 gySourceSize,gyAtlasSize,gyTileSize,gyGrid;
vec2 gyTileCell(float index,float columns){
 // 整数图块编号在除法前加半格，避免倒数乘法把整行起点舍入到上一行。
 float row=floor((index+.5)/columns);
 return vec2(index-row*columns,row);
}
vec2 gyFramePixel(){
 if(gyPacked<.5)return gl_FragCoord.xy;
 vec2 p=vec2(gl_FragCoord.x,gyAtlasSize.y-gl_FragCoord.y),cell=floor(p/gyTileSize);float index=cell.y*gyGrid.y+cell.x;
 vec2 top=gyTileCell(index,gyGrid.x)*gyTileSize+mod(p,gyTileSize);
 return vec2(top.x,gySourceSize.y-top.y);
}
vec2 gyFrameUV(vec2 regular){if(gyPacked<.5)return regular;return gyFramePixel()/gySourceSize;}
vec2 gyAtlasUV(vec2 p){
 vec2 cell=floor(p/gyTileSize);float index=cell.y*gyGrid.x+cell.x;
 vec2 top=gyTileCell(index,gyGrid.y)*gyTileSize+(p-cell*gyTileSize)+.5;
 return vec2(top.x,gyAtlasSize.y-top.y)/gyAtlasSize;
}
vec4 gySample(sampler2D source,vec2 q){
 if(gyPacked<.5)return texture2D(source,q);
 vec2 p=clamp(vec2(q.x,1.-q.y)*gySourceSize-.5,vec2(0.),gySourceSize-1.),a=floor(p),b=min(a+1.,gySourceSize-1.),f=fract(p);
 return mix(mix(texture2D(source,gyAtlasUV(a)),texture2D(source,gyAtlasUV(vec2(b.x,a.y))),f.x),mix(texture2D(source,gyAtlasUV(vec2(a.x,b.y))),texture2D(source,gyAtlasUV(b)),f.x),f.y);
}
`;

// 仅替换明确的照片采样器，局部蒙版不能按照片图块寻址。
export function virtualFragment(fragment,samplers){
 const names=samplers.join('|');let code=fragment.replace(new RegExp('texture2D\\s*\\(\\s*('+names+')\\s*,','g'),'gySample($1,').replaceAll('gl_FragCoord.xy','gyFramePixel()');
 code=code.replace(/precision\s+highp\s+float\s*;/,match=>match+'\n'+glsl);
 return code.replace(/void\s+main\s*\(\s*\)\s*\{/,match=>match+'vec2 gyInterpolatedUV=uv;vec2 uv=gyFrameUV(gyInterpolatedUV);');
}

const locations=new WeakMap();
export function bindVirtualTexture(gl,program,layout){
 let u=locations.get(program);if(!u){u=Object.fromEntries(['gyPacked','gySourceSize','gyAtlasSize','gyTileSize','gyGrid'].map(k=>[k,gl.getUniformLocation(program,k)]));locations.set(program,u);}
 gl.uniform1f(u.gyPacked,layout?.packed?1:0);if(!layout?.packed)return;
 gl.uniform2f(u.gySourceSize,layout.sourceWidth,layout.sourceHeight);gl.uniform2f(u.gyAtlasSize,layout.width,layout.height);gl.uniform2f(u.gyTileSize,layout.tileWidth,layout.tileHeight);gl.uniform2f(u.gyGrid,layout.sourceColumns,layout.atlasColumns);
}
