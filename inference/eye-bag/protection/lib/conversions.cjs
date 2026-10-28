'use strict';
// Only finite baseline conversions are checked against original complete leaves.
// Polygon selection / final combination below are static-contract candidates.
const Q=Object.freeze([62,63,64,65,58,72,71,70,69]);
const R=Object.freeze([4,3,2,1,0,18,19,20,21,22,59,54,66,40,39,38,37,36,9,10,11,12,13]);
function roundEvenF32(x) {
  x=Math.fround(x);
  if(!Number.isFinite(x)||x < -2147483648||x >= 2147483648) throw new RangeError('finite int32 domain required');
  const lo=Math.floor(x),f=x-lo;
  const n=f<.5?lo:f>.5?lo+1:(lo%2===0?lo:lo+1);
  return n===0?0:n;
}
function convert(kind,input) {
  switch(kind) {
    case 'f32-s32':return Array.from(input,roundEvenF32);
    case 'u8-s32':return Array.from(input,x=>{if(!Number.isInteger(x)||x<0||x>255)throw new RangeError('BYTE');return x;});
    case 's32-u8':return Array.from(input,x=>{if(!Number.isInteger(x)||x<-2147483648||x>2147483647)throw new RangeError('S32');return Math.max(0,Math.min(255,x));});
    default:throw new RangeError(kind);
  }
}
function selectPolygon(points,which) {
  if(points.length!==388)throw new RangeError('explicit aligned194 XY');
  const ids=which==='Q'?Q:which==='R'?R:null;
  if(!ids)throw new RangeError(which);
  return Int32Array.from(ids.flatMap(i=>[roundEvenF32(points[i*2]),roundEvenF32(points[i*2+1])]));
}
function combineFinal(projected,q,r) {
  if(projected.length!==q.length||q.length!==r.length)throw new RangeError('dimensions');
  return Uint8Array.from(projected,(v,i)=>Math.min(255,v+q[i]+r[i]));
}
function supportThreshold(projected) {return Uint8Array.from(projected,x=>x>80?1:0);}
module.exports={Q,R,roundEvenF32,convert,selectPolygon,combineFinal,supportThreshold};
