'use strict';
const f=Math.fround,scale=f(1/127.5);
function cropDecision(points,side,[width,height]=[1536,1536]){
 if(!(points instanceof Float32Array)||points.length!==388||!points.every(Number.isFinite))throw new TypeError('finite194x2 F32');
 if(!['left','right'].includes(side)||![width,height].every(v=>Number.isInteger(v)&&v>0))throw new TypeError('side/WH');
 const cvtt=x=>x>=2147483648||x< -2147483648?-2147483648:Math.trunc(x),avg=(a,b)=>Math.trunc(((cvtt(a)+cvtt(b))|0)/2),clip=(a,n)=>Math.max(0,Math.min(n-1,a));
 const a=clip(side==='left'?avg(points[0],points[218]):cvtt(points[108]),width),b=clip(side==='left'?cvtt(points[108]):avg(points[18],points[282]),width);
 const top=clip(cvtt(points[(side==='left'?2:11)*2+1]),height),bottom=clip(cvtt(points[117]),height);
 return a!==b&&top<bottom?{valid:true,rect:[Math.min(a,b),top,Math.abs(a-b),bottom-top]}:{valid:false,rect:null};
}
function cropBytes(data,width,height,channels,[x,y,w,h]){
 if(!(data instanceof Uint8Array)||data.length!==width*height*channels||![3,4].includes(channels)||w<=0||h<=0||x<0||y<0||x+w>width||y+h>height)throw new RangeError('explicit BYTE ROI');
 const out=new Uint8Array(w*h*channels);for(let r=0;r<h;r++)out.set(data.subarray(((y+r)*width+x)*channels,((y+r)*width+x+w)*channels),r*w*channels);return out;
}
// Original crop caller statically clones into a fresh Mat without SUBMATRIX.
// Replay supplies that Mat ABI; complete allocator/clone is not executed.
function padIndependentCrop(data,width,height,channels){
 const size=Math.max(width,height),diff=Math.abs(width-height),lo=diff>>>1,hi=diff-lo;
 const edges=width>=height?[lo,hi,0,0]:[0,0,lo,hi],out=new Uint8Array(size*size*channels);
 for(let y=0;y<height;y++)out.set(data.subarray(y*width*channels,(y+1)*width*channels),((y+edges[0])*size+edges[2])*channels);
 return {data:out,width:size,height:size,edges};
}
function normalizePhysical012(data,width,height,channels){
 if(!(data instanceof Uint8Array)||data.length!==width*height*channels||![3,4].includes(channels))throw new RangeError('physicalBYTE');
 const n=width*height,out=new Float32Array(n*3),planes=new Float32Array(n*3);
 for(let i=0;i<n;i++)for(let c=0;c<3;c++){const x=data[i*channels+c];planes[c*n+i]=x;out[c*n+i]=f(f(x-127.5)*scale);}
 return {planes,tensor:out};
}
function prepareEyeInput({aligned1536,aligned194,side,channels,imageLibrary}){
 const decision=cropDecision(aligned194,side);if(!decision.valid)return {decision};
 const crop=cropBytes(aligned1536,1536,1536,channels,decision.rect),[,,w,h]=decision.rect,padded=padIndependentCrop(crop,w,h,channels);
 const resized=imageLibrary.resizeBytes({data:padded.data,width:padded.width,height:padded.height,channels,targetWidth:384,targetHeight:384});
 return {decision,crop,padded,resized,...normalizePhysical012(resized,384,384,channels)};
}
module.exports={cropDecision,cropBytes,padIndependentCrop,normalizePhysical012,prepareEyeInput};
