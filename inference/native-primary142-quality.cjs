'use strict';
// Original optional2032[142], copied then modified by147af3550.
// No original request scheduler, allocator or singleton initialization claim.
const f = Math.fround;
const rules = Object.freeze([
  [[60,61],59,62], [[67,68],66,69], [[84],83,85], [[86],85,87],
  [[88],87,89], [[90],89,91], [[92],91,93], [[94],73,93], [[107,108],89,125],
].map(([indices,start,end])=>Object.freeze({indices:Object.freeze(indices),start,end})));
function decodePrimary142Quality(output2032, optionsQualityByte=1) {
  if (!Number.isInteger(optionsQualityByte) || optionsQualityByte<0 || optionsQualityByte>255)
    throw new TypeError('Explicit Options+3e BYTE required');
  if (optionsQualityByte !== 1) return null;
  if (!(output2032 instanceof Float32Array) || output2032.length !== 142)
    throw new TypeError('Original output2032 Float32Array[142] required');
  if (!output2032.every(Number.isFinite)) throw new TypeError('原关键点质量含无效数值');
  const q = new Float32Array(output2032);
  for (const {indices,start,end} of rules) {
    const initial = q[start], delta = f(q[end]-initial), divisor = f(indices.length+1);
    for (let i=0;i<indices.length;i++) q[indices[i]]=f(initial+f(f(f(i+1)*delta)/divisor));
  }
  return q;
}
module.exports = {decodePrimary142Quality,rules};
