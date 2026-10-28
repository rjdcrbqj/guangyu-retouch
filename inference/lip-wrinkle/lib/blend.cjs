'use strict';
// Bounded numeric fragments, not the full Lip cache/render pipeline.
const f = Math.fround;
const RECIP255 = new Float32Array(new Uint32Array([0x3b808081]).buffer)[0];
function residualFromMinMasks({old, model, maskA, maskB, channels, destination}) {
  if (![3,4].includes(channels) || !(old instanceof Uint8Array) || !(model instanceof Uint8Array) || !(maskA instanceof Uint8Array) || !(maskB instanceof Uint8Array)) throw new TypeError('typed physical BYTE arrays/channels required');
  const n = maskA.length;
  if (n < 1 || n > 65536 || maskB.length !== n || old.length !== n*channels || model.length !== n*3) throw new RangeError('bounded dimensions mismatch');
  const out = destination || new Float32Array(n*channels);
  if (!(out instanceof Float32Array) || out.length !== n*channels) throw new RangeError('F32 destination mismatch');
  for (let i=0;i<n;i++) {
    const m=Math.min(maskA[i],maskB[i]);
    for(let c=0;c<3;c++) {
      const s=old[i*channels+c], sum=(255-m)*s+m*model[i*3+c];
      out[i*channels+c]=f(f(f(sum)*RECIP255)-f(s));
    }
  }
  return out; // fourth F32 lane is deliberately not written.
}
function cvtss2siNearestEven(value) {
  if (!Number.isFinite(value) || value < -2147483648 || value >= 2147483648) return -2147483648;
  const lo=Math.floor(value), frac=value-lo;
  return frac<.5?lo:frac>.5?lo+1:(lo%2===0?lo:lo+1);
}
function applyRoundedResidual({old, residual, channels}) {
  if (![3,4].includes(channels) || !(old instanceof Uint8Array) || !(residual instanceof Float32Array) || residual.length!==old.length || old.length%channels || old.length/channels>65536) throw new TypeError('bounded BYTE/F32 dimensions required');
  const out=new Uint8Array(old);
  for(let i=0;i<old.length;i+=channels)for(let c=0;c<3;c++)out[i+c]=Math.max(0,Math.min(255,cvtss2siNearestEven(f(f(old[i+c])+residual[i+c]))));
  return out; // source fourth BYTE is preserved.
}
module.exports={residualFromMinMasks,applyRoundedResidual,cvtss2siNearestEven,RECIP255};
