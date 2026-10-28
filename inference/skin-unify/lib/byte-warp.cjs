'use strict';
const warp=require('./coordinates.cjs');
function warpByte(a,w,h,m,tw,th,cn=3){
 const k=warp.coords(Array.from(m),tw,th),o=new Uint8Array(tw*th*cn),sample=(x,y,c)=>x<0||y<0||x>=w||y>=h?0:a[(y*w+x)*cn+c];
 for(let i=0;i<tw*th;i++){const x=k.xy[i*2],y=k.xy[i*2+1],fx=k.alpha[i]&31,fy=k.alpha[i]>>5;let weights=[(32-fx)*(32-fy)*32,fx*(32-fy)*32,(32-fx)*fy*32,fx*fy*32];if(weights[0]===32768)weights=[32767,0,0,1];for(let c=0;c<cn;c++){const v=sample(x,y,c)*weights[0]+sample(x+1,y,c)*weights[1]+sample(x,y+1,c)*weights[2]+sample(x+1,y+1,c)*weights[3];o[i*cn+c]=Math.max(0,Math.min(255,(v+16384)>>15));}}
 return o;
}
module.exports={warpByte};
