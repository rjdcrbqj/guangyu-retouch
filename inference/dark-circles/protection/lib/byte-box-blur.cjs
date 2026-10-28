'use strict';
// Finite pure JS transcription of the original U8→U16→U8 SSE4.1 box branch.
const {reflect}=require('./coordinates.cjs');
const COEFFICIENTS=Object.freeze({3:[932068,4],5:[335544,13],9:[103563,41],11:[69327,61],15:[37283,112]});
function boxBlurByte({data,width:w,height:h,kernel:n}){
 if(!(data instanceof Uint8Array)||data.length!==w*h||![w,h].every(x=>Number.isInteger(x)&&x>=2&&x<=4096)||!COEFFICIENTS[n])throw RangeError('BYTE box finite domain: >=2 dimensions, k3/5/9/11/15');
 const a=n>>1,rows=new Uint16Array(w*h),out=new Uint8Array(w*h),sums=new Uint16Array(w),[mult,delta]=COEFFICIENTS[n];
 for(let y=0;y<h;y++){
  let s=0;for(let k=-a;k<=a;k++)s+=data[y*w+reflect(k,w)];rows[y*w]=s;
  for(let x=1;x<w;x++){s+=data[y*w+reflect(x+a,w)]-data[y*w+reflect(x-a-1,w)];rows[y*w+x]=s;}
 }
 for(let y=-a;y<a;y++){const j=reflect(y,h)*w;for(let x=0;x<w;x++)sums[x]+=rows[j+x];}
 for(let y=0;y<h;y++){const next=reflect(y+a,h)*w,first=reflect(y-a,h)*w;for(let x=0;x<w;x++){const z=sums[x]+rows[next+x];out[y*w+x]=((z+delta)*mult)>>>23;sums[x]=z-rows[first+x];}}
 return out;
}
module.exports={boxBlurByte,COEFFICIENTS};
