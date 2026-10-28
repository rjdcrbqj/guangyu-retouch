'use strict';

// Fixed RN shape2 ellipse5, anchor2,2; full sparse2D support rather than separable RECT.
const offsets = [
  [0, -2],
  [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
  [0, 2]
];

function dilateReferenceMask({data, width, height, rounding} = {}) {
  if (!Number.isInteger(width) || width < 5 || width > 1500 ||
      !Number.isInteger(height) || height < 5 || height > 1500)
    throw RangeError('reference dilation dimensions must be integers in 5..1500');
  if (!(data instanceof Uint8Array) || data.length !== width * height)
    throw TypeError('reference dilation requires a packed mono BYTE plane');
  if (rounding !== 'nearest-even')
    throw RangeError('reference dilation requires explicit nearest-even kernel construction');

  const output = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let maximum = 0;
    for (const [dx, dy] of offsets) {
      const sx = x + dx, sy = y + dy;
      const sample = sx < 0 || sy < 0 || sx >= width || sy >= height ? 0 : data[sy * width + sx];
      if (sample > maximum) maximum = sample;
    }
    output[y * width + x] = maximum;
  }
  return output;
}

module.exports = {dilateReferenceMask};
