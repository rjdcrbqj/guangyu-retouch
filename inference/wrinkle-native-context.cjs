'use strict';
// Research only. Direct contracts from native callers; no attribute semantics inferred.
const f32 = Math.fround;
function cvttss2si(value) {
  value = f32(value);
  if (!Number.isFinite(value) || value < -2147483648 || value >= 2147483648) return -2147483648;
  return Math.trunc(value);
}
function attribute0FromOutput(value) {
  return Math.max(0, Math.min(80, cvttss2si(value)));
}
function attribute34FromOutput(values) {
  if (!values || values.length < 2) throw new Error('original model 0x84 requires two outputs');
  return { 3: f32(values[1]), 4: f32(values[0]) };
}
function attribute5678FromOutput(values) {
  if (!values || values.length < 4) throw new Error('original model 0x86 requires four outputs');
  return { 5: f32(values[0]), 6: f32(values[1]), 7: f32(values[2]), 8: f32(values[3]) };
}
function requireAttribute(attrs, id) {
  const value = attrs instanceof Map ? attrs.get(id) : attrs && attrs[id];
  if (typeof value !== 'number') throw new Error(`missing original attribute id ${id}`);
  return f32(value);
}
function nativeAttributeContext(currentFaceAttributes, firstFaceAttributes) {
  const context = cvttss2si(requireAttribute(currentFaceAttributes, 0));
  const scores = [5, 6, 7, 8].map(id => requireAttribute(firstFaceAttributes, id));
  let winner = 0;
  for (let i = 1; i < 4; i++) if (scores[winner] < scores[i]) winner = i;
  return { nativeContextInt: context, firstFaceWinningAttributeId: winner + 5,
    nativeRegion7ProtectionFlag: winner === 1 };
}
function nativeScalar358(sourceWidth, sourceHeight, roiWidth, roiHeight) {
  for (const n of [sourceWidth, sourceHeight, roiWidth, roiHeight])
    if (!Number.isInteger(n) || n <= 0) throw new Error('positive native image dimensions required');
  // 145bb03bd..145bb0401: min(full rows,cols) / max(original ROI width,height).
  return f32(f32(Math.min(sourceWidth, sourceHeight)) / f32(Math.max(roiWidth, roiHeight)));
}
function nativeRegion9Crop(aligned194) {
  if (!aligned194 || aligned194.length < 194) throw new Error('original aligned 194 points required');
  const x0 = f32(aligned194[73][0]), y0 = f32(aligned194[58][1]);
  const crop = { x: cvttss2si(x0), y: cvttss2si(y0),
    width: cvttss2si(f32(f32(aligned194[83][0]) - x0)),
    height: cvttss2si(f32(f32(aligned194[104][1]) - y0)) };
  crop.valid = crop.x > 0 && crop.y > 0 && crop.width > 0 && crop.height > 0 &&
    crop.x + crop.width <= 1535 && crop.y + crop.height <= 1535;
  return crop;
}
function nativeRegion9Protection({ alignedAuxiliaryByteMask1536, aligned194,
  nativeContextInt, rawRegion9Strength, previousFlag = false }) {
  if (!(alignedAuxiliaryByteMask1536 instanceof Uint8Array) || alignedAuxiliaryByteMask1536.length !== 1536 * 1536)
    throw new Error('original auxiliary BYTE mask warped to 1536 square is required');
  if (!Number.isInteger(nativeContextInt)) throw new Error('nativeContextInt must already be cvttss2si');
  const crop = nativeRegion9Crop(aligned194);
  const threshold = nativeContextInt <= 50 ? 50 : 140;
  let count = 0, ratio = null;
  const active = f32(rawRegion9Strength) > 0 && crop.valid;
  if (active) {
    for (let y = crop.y; y < crop.y + crop.height; y++)
      for (let x = crop.x; x < crop.x + crop.width; x++)
        if (alignedAuxiliaryByteMask1536[y * 1536 + x] > threshold) count++;
    ratio = f32(count / (crop.width * crop.height));
  }
  return { nativeRegion9ProtectionFlag: Boolean(previousFlag || (active && ratio > 0.3)),
    crop, threshold, count, ratio, active };
}
module.exports = { cvttss2si, attribute0FromOutput, attribute34FromOutput,
  attribute5678FromOutput, nativeAttributeContext, nativeScalar358,
  nativeRegion9Crop, nativeRegion9Protection };
