'use strict';

const AREA = 768 * 768;
const LUMA = [0.2126, 0.7152, 0.0722];

// 从掩码内 RGB 样本估计中心色。每端裁去十分之一的权重，降低反光和暗点的影响。
function sampleTone(photo, mask) {
  const histograms = Array.from({length: 3}, () => new Float64Array(256));
  let weight = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= 0) continue;
    weight += mask[i];
    for (let ch = 0; ch < 3; ch++) {
      const value = Math.max(0, Math.min(255, Math.round((photo[ch * mask.length + i] + 1) * 127.5)));
      histograms[ch][value] += mask[i];
    }
  }
  if (!weight) return null;
  return histograms.map(hist => {
    let sum = 0, count = 0;
    for (let value = 0; value < hist.length; value++) {
      const next = count + hist[value];
      const kept = Math.max(0, Math.min(next, weight * .9) - Math.max(count, weight * .1));
      sum += kept * value;
      count = next;
    }
    return sum / (weight * .8);
  });
}
const luma = rgb => rgb.reduce((value, component, ch) => value + component * LUMA[ch], 0);

// 用每个原像素的自身亮度缩放色差，保留皮肤纹理与明暗层次；强度和选区在原尺寸贴回时生效。
class PublicReferenceTransfer {
  run({photo, currentMask, reference, referenceMask}) {
    const source = sampleTone(photo, currentMask), target = sampleTone(reference, referenceMask);
    const coefficients = new Float32Array(9 * AREA), mask = new Float32Array(AREA).fill(-1);
    if (!source || !target) return {coefficients, mask, publicTransfer: true};
    const base = luma(source), exposure = luma(target) - base;
    const gains = source.map((value, ch) => {
      const shift = target[ch] - value - .65 * exposure;
      return Math.abs(shift) < 1 ? 0 : Math.max(-.5, Math.min(.5, shift / Math.max(32, base)));
    });
    if (gains.some(gain => gain !== 0)) {
      mask.fill(1);
      for (let ch = 0; ch < 3; ch++) for (let input = 0; input < 3; input++) {
        const offset = (3 * ch + input) * AREA;
        coefficients.fill(gains[ch] * LUMA[input], offset, offset + AREA);
      }
    }
    return {coefficients, mask, publicTransfer: true};
  }
  close() {}
}
module.exports = {PublicReferenceTransfer};
