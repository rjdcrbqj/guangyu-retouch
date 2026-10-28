'use strict';
// Original complete 143ab7a70, reached through 143aae830 -> 143a95300
// ->143ab4df0 with explicit CPU predicates false(256,11,6).
// K=3, alpha=1, beta=0, B_T, nonalias Nx3*[2x3]^T. No general Mat ABI.
function affineGemmOriginalCpuFalse(points,affine){
 if(!(points instanceof Float32Array)||points.length%2||points.length===0||points.length>388||!points.every(Number.isFinite))throw new TypeError('finite F32 XY points');
 if(!(affine instanceof Float32Array)||affine.length!==6||!affine.every(Number.isFinite))throw new TypeError('finite F32 2x3 affine');
 const out=new Float32Array(points.length);
 for(let k=0;k<points.length;k+=2){
  const x=points[k],y=points[k+1];
  // 143ab906a starts product0+DOUBLE(+0), 90a4 adds product1,
  // 90bb adds product2; 90cc/90d0/90d8 reduce unused +0 lanes.
  // Explicit +0 keeps original sign of a zero result (old shorthand did not).
  out[k]=Math.fround(0+(((x*affine[0]+0)+y*affine[1])+affine[2])+0);
  out[k+1]=Math.fround(0+(((x*affine[3]+0)+y*affine[4])+affine[5])+0);
 }
 return out;
}
module.exports={affineGemmOriginalCpuFalse};
