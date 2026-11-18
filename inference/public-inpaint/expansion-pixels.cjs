'use strict';

const maxDimension = 32766;
const maxPixels = 80_000_000;

function validSize(width, height) {
  return Number.isSafeInteger(width) && width >= 1 && width <= maxDimension &&
    Number.isSafeInteger(height) && height >= 1 && height <= maxDimension &&
    width * height <= maxPixels;
}

function expansionSize(sourceWidth, sourceHeight, margins) {
  if (!validSize(sourceWidth, sourceHeight)) throw new RangeError('原照片尺寸超出限制');
  if (!margins || typeof margins !== 'object') throw new TypeError('缺少画布扩展边距');
  const { left = 0, top = 0, right = 0, bottom = 0 } = margins;
  if (![left, top, right, bottom].every(value => Number.isSafeInteger(value) && value >= 0) ||
      !(left || top || right || bottom)) {
    throw new RangeError('画布扩展边距必须是非负整数，且至少扩展一侧');
  }
  const width = sourceWidth + left + right;
  const height = sourceHeight + top + bottom;
  if (!validSize(width, height)) throw new RangeError('扩展后的画布尺寸超出限制');
  return { width, height, core: { left, top, width: sourceWidth, height: sourceHeight } };
}

function forEachAddedSpan({ width, height, core }, visit) {
  const right = core.left + core.width;
  const bottom = core.top + core.height;
  for (let y = 0; y < height; y++) {
    if (y < core.top || y >= bottom) {
      visit(y, 0, width);
    } else {
      if (core.left) visit(y, 0, core.left);
      if (right < width) visit(y, right, width);
    }
  }
}

function createExpandedFrame(source, sourceWidth, sourceHeight, margins) {
  const size = expansionSize(sourceWidth, sourceHeight, margins);
  if (!(source instanceof Uint8Array) || source.length !== sourceWidth * sourceHeight * 4) {
    throw new TypeError('原照片像素缓冲区尺寸不匹配');
  }
  const { width, height, core } = size;
  const data = Buffer.alloc(width * height * 4);
  const mask = new Uint8Array(width * height);

  // 按原尺寸复制 RGBA 行，保留透明像素携带的 RGB。
  const stride = sourceWidth * 4;
  for (let y = 0; y < sourceHeight; y++) {
    const from = y * stride;
    const to = ((core.top + y) * width + core.left) * 4;
    data.set(source.subarray(from, from + stride), to);
  }
  forEachAddedSpan(size, (y, begin, end) => {
    mask.fill(255, y * width + begin, y * width + end);
    for (let index = (y * width + begin) * 4 + 3; index < (y * width + end) * 4; index += 4) data[index] = 255;
  });
  return { ...size, data, mask };
}

function reflectedCoordinate(position, length) {
  if (position < 0) return Math.min(length - 1, -position - 1);
  if (position >= length) return Math.max(0, 2 * length - position - 1);
  return position;
}

function finishExpandedFrame(frame, sampleRgb) {
  const { data, width, height, core } = frame;
  const right = core.left + core.width;
  const bottom = core.top + core.height;
  const band = Math.max(4, Math.min(16, Math.round(Math.min(width, height) * .012)));
  const color = new Float32Array(3);
  forEachAddedSpan(frame, (y, begin, end) => {
    const dy = Math.max(core.top - y, y - bottom + 1, 0);
    const mirrorY = core.top + reflectedCoordinate(y - core.top, core.height);
    for (let x = begin; x < end; x++) {
      const dx = Math.max(core.left - x, x - right + 1, 0);
      const distance = dx && dy ? Math.hypot(dx, dy) : dx + dy;
      const pixel = (y * width + x) * 4;
      sampleRgb(x, y, color);

      // 镜像色只参与新增侧的接缝，原像素的透明度决定它的颜色权重。
      let mirror = pixel;
      let mirrorWeight = 0;
      if (distance < band) {
        const mirrorX = core.left + reflectedCoordinate(x - core.left, core.width);
        mirror = (mirrorY * width + mirrorX) * 4;
        const t = (distance - 1) / (band - 1);
        mirrorWeight = (1 - t * t * (3 - 2 * t)) * data[mirror + 3] / 255;
      }
      for (let channel = 0; channel < 3; channel++) {
        const estimate = Math.min(255, Math.max(0, color[channel]));
        data[pixel + channel] = Math.round(estimate + (data[mirror + channel] - estimate) * mirrorWeight);
      }
      data[pixel + 3] = 255;
    }
  });
  return data;
}

module.exports = { expansionSize, createExpandedFrame, finishExpandedFrame };
