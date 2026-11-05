'use strict';
const sharp = require('sharp');
const maxPixels = 80000000;

// A decoded frame is already in display orientation and sRGB. Reusing it lets
// detection, landmark crops and corrections see the same pixels on large photos.
function openPublicPhoto(input) {
  if (input instanceof Uint8Array && input.length && input.length <= 64 * 1024 * 1024) {
    return sharp(input, { limitInputPixels: maxPixels });
  }
  const { data, width, height } = input || {};
  if (
    !Buffer.isBuffer(data) ||
    ![width, height].every((n) => Number.isInteger(n) && n >= 2 && n <= 32766) ||
    width * height > maxPixels ||
    data.length !== width * height * 4
  ) {
    throw new TypeError('照片数据无效');
  }
  return sharp(data, { raw: { width, height, channels: 4 }, limitInputPixels: maxPixels });
}
module.exports = { openPublicPhoto };
