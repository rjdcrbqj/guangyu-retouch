'use strict';
// Finite explicit-buffer candidate for only original145c0c560..145c0c694 row loop.
// Warp, protection, NN, masks, allocator and outer mutable scheduling are external.
const f=Math.fround;
function blendRow(source, corrected, mask, channels, diagnostic) {
  const n=mask.length;
  if (![3,4].includes(channels)||n<1||n>4096||source.length!==n*channels||corrected.length!==n*3||diagnostic.length!==n*3) throw new Error('invalid bounded row');
  if (!Array.from(corrected).concat(Array.from(mask)).every(v=>Number.isFinite(v)&&Math.abs(v)<1000)) throw new Error('finite explicit buffers required');
  const output=Uint8Array.from(source), delta=Uint8Array.from(diagnostic);
  for(let x=0;x<n;x++) {
    const a=f(mask[x]);
    if(a===0) continue;
    const inv=f(1-a);
    for(let c=0;c<3;c++) {
      const i=x*channels+c, old=output[i];
      const value=f(f(f(corrected[x*3+c])*a)+f(old*inv));
      const v=Math.max(0,Math.min(255,Math.trunc(value)));
      output[i]=v;delta[x*3+c]=Math.abs(v-old);
    }
  }
  return {output,diagnostic:delta};
}
module.exports={blendRow};
