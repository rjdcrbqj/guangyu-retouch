'use strict';
const {refineSuppliedReferenceBaseROI} = require('./base-refine.cjs');

function validateMask(mask, side, rounding) {
  if (!Number.isInteger(side) || side < 1 || side > 1500 ||
      !(mask instanceof Uint8Array) || mask.length !== side * side || rounding !== 'nearest-even')
    throw TypeError('square base requires packed BYTE S1..1500 and explicit nearest-even');
}

// Only acceptedgate geometry: this does not expose an original rawbbox diagnostic.
function planFromMask(mask, side) {
  let minX = side, minY = side, maxX = -1, maxY = -1;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    if (mask[y * side + x] === 0) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX + 1, height = maxY - minY + 1;
  if (width < 5 || height < 5) return {ROI: null, radius: null};
  const maxSide = Math.max(width, height);
  const radius = maxSide < 800 ? Math.max(1, Math.floor(maxSide / 50)) : 15;
  const x = Math.max(0, minX - radius), y = Math.max(0, minY - radius);
  const right = Math.min(side, maxX + 1 + radius), bottom = Math.min(side, maxY + 1 + radius);
  return {ROI: Int32Array.from([x, y, right - x, bottom - y]), radius};
}

function planSuppliedSquareReferenceBase({mask, side, rounding} = {}) {
  validateMask(mask, side, rounding);
  return planFromMask(mask, side);
}

function refineSuppliedSquareReferenceBase(request = {}) {
  // Weight properties must remain unread until after the original no-write gate.
  const {guide, mask, side, rounding} = request;
  validateMask(mask, side, rounding);
  if (!(guide instanceof Uint8Array) || guide.length !== side * side * 3)
    throw TypeError('square base guide must be packed physical BYTE3 with matching S');
  const planned = planFromMask(mask, side);
  if (planned.ROI === null) return {updated: false, mask: null, ROI: null, radius: null};

  const range = request.range, spatial = request.spatial;
  const [x, y, width, height] = planned.ROI;
  const croppedGuide = new Uint8Array(width * height * 3), croppedMask = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const start = (y + row) * side + x;
    croppedMask.set(mask.subarray(start, start + width), row * width);
    croppedGuide.set(guide.subarray(start * 3, (start + width) * 3), row * width * 3);
  }
  const result = refineSuppliedReferenceBaseROI({guide: croppedGuide, mask: croppedMask, width, height,
    radius: planned.radius, range, spatial, rounding});
  const output = new Uint8Array(side * side);
  for (let row = 0; row < height; row++)
    output.set(result.subarray(row * width, (row + 1) * width), (y + row) * side + x);
  return {updated: true, mask: output, ROI: planned.ROI, radius: planned.radius};
}

module.exports = {refineSuppliedSquareReferenceBase, planSuppliedSquareReferenceBase};
