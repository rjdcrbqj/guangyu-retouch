'use strict';
const f=Math.fround;
function int(name,x,min=0){if(!Number.isInteger(x)||x<min||x>0x7fffffff)throw new RangeError(name);return x;}
function roundNearestEven(x){let low=Math.floor(x),part=x-low;return part<.5?low:part>.5?low+1:(low%2===0?low:low+1);}
function deadzone(x){return x===79||x===81?80:x;}
function encode80({data,width,height,sourceStrideF32=width*3,targetStrideBYTE=width*3,startRow=0,endRow=height,cpuMode='scalar',initial}){
 int('width',width);int('height',height);int('sourceStrideF32',sourceStrideF32);int('targetStrideBYTE',targetStrideBYTE);int('startRow',startRow);int('endRow',endRow);
 if(sourceStrideF32<width*3||targetStrideBYTE<width*3||startRow>endRow||endRow>height)throw new RangeError('shape');
 if(!(data instanceof Float32Array)||data.length!==sourceStrideF32*height)throw new TypeError('F32 input exact shape');
 if(!['scalar','sse','avx2'].includes(cpuMode))throw new RangeError('explicit cpuMode');
 const out=initial===undefined?new Uint8Array(targetStrideBYTE*height):new Uint8Array(initial);
 if(out.length!==targetStrideBYTE*height)throw new RangeError('initial exact shape');
 const n=width*3,chunk=cpuMode==='sse'?16:cpuMode==='avx2'?32:0,vectorCount=chunk?Math.floor(n/chunk)*chunk:0;
 for(let y=startRow;y<endRow;y++)for(let i=0;i<n;i++){
  const x=f(data[y*sourceStrideF32+i]+80);
  if(!Number.isFinite(x)||x< -2147483648||x>2147483520)throw new RangeError('finite F32 sum in safe signed conversion range required');
  const q=i<vectorCount?roundNearestEven(x):Math.trunc(x+.5);
  out[y*targetStrideBYTE+i]=deadzone(Math.max(0,Math.min(255,q)));
 }
 return out;
}
function paste80({source,encoded,width,height,channels}){
 int('width',width);int('height',height);if(channels!==3&&channels!==4)throw new RangeError('channels');
 if(!(source instanceof Uint8Array)||source.length!==width*height*channels||!(encoded instanceof Uint8Array)||encoded.length!==width*height*3)throw new RangeError('BYTE exact shape');
 const out=new Uint8Array(source);
 for(let i=0;i<width*height;i++)for(let c=0;c<3;c++)out[i*channels+c]=Math.max(0,Math.min(255,source[i*channels+c]-80+encoded[i*3+c]));
 return out;
}
module.exports={encode80,paste80,roundNearestEven};
