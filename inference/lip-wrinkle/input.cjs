'use strict';
const {prepare}=require('./geometry.cjs'),{warpByte}=require('./lib/byte-warp.cjs');
const f=Math.fround,scale=f(1/127.5);
function prepareLipInput({data,width,height,source194,target142}){
 if(!(data instanceof Uint8Array)||data.length!==width*height*3||![width,height].every(v=>Number.isInteger(v)&&v>0))throw Error('supplied RGB301 BYTE image');
 const geometry=prepare({source194,sourceWH:[width,height],target142}),[x,y,w,h]=geometry.ROI,roi=new Uint8Array(w*h*3);
 for(let r=0;r<h;r++)roi.set(data.subarray(((y+r)*width+x)*3,((y+r)*width+x+w)*3),r*w*3);
 const [mw,mh]=geometry.modelWH,aligned=warpByte(roi,w,h,geometry.final,mw,mh,3),n=mw*mh,planes=new Float32Array(3*n),tensor=new Float32Array(3*n);
 for(let i=0;i<n;i++)for(let c=0;c<3;c++){const value=aligned[i*3+c];planes[c*n+i]=value;tensor[c*n+i]=f(f(value-f(127.5))*scale);}
 return {geometry,roi,aligned,planes,tensor,shape:[1,3,mh,mw]};
}
module.exports={prepareLipInput};
