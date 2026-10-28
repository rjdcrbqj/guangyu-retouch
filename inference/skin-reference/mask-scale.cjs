'use strict';

const f = Math.fround;
const MAX_SIDE = 32766, MAX_PIXELS = 80000000;
function nearestEven(value) {
  const lower = Math.floor(value), rest = value - lower;
  return lower + (rest > .5 || (rest === .5 && lower % 2 !== 0) ? 1 : 0);
}
function validSize(width, height, minimum) {
  return [width, height].every(v => Number.isInteger(v) && v >= minimum && v <= MAX_SIDE) && width * height <= MAX_PIXELS;
}
function axis(size, destination, scale, horizontal) {
  const inverse = 1 / scale, plan = new Array(destination);
  for (let i = 0; i < destination; i++) {
    const coordinate = f((i + .5) * inverse - .5);
    let index = Math.floor(coordinate), fraction = f(coordinate - f(index));
    if (horizontal && (index < 0 || index >= size - 1)) {
      index = Math.max(0, Math.min(size - 1, index)); fraction = 0;
    }
    // 两次独立F32乘法与RNE；合法pair可能和为2047或2049。
    plan[i] = [index, nearestEven(f(f(1 - fraction) * 2048)), nearestEven(f(fraction * 2048))];
  }
  return plan;
}

// 供给的是caller完成mask选择后的BYTE1。此函数不生成fallback或未知CV组合。
function scaleSuppliedReferenceMask(request) {
  if (request === null || typeof request !== 'object') throw new TypeError('mask-scale需要明确参数');
  const { data, width, height, stride, sourcePhotoWH, rounding, math } = request;
  if (!validSize(width, height, 1)) throw new RangeError('mask-scale源WH必须为1..32766且不超过80MP');
  if (!(Array.isArray(sourcePhotoWH) || sourcePhotoWH instanceof Int32Array) || sourcePhotoWH.length !== 2 ||
      !validSize(sourcePhotoWH[0], sourcePhotoWH[1], 2)) {
    throw new RangeError('mask-scale sourcePhotoWH必须为两INT2..32766且不超过80MP');
  }
  if (!(data instanceof Uint8Array) || rounding !== 'nearest-even' || math !== 'native-code1-scalar') {
    throw new TypeError('mask-scale需要BYTE1与显式nearest-even/native-code1-scalar');
  }
  const scale = f(f(Math.max(sourcePhotoWH[0], sourcePhotoWH[1])) * f(1 / 1024));
  const destinationWidth = nearestEven(width * scale), destinationHeight = nearestEven(height * scale);
  if (!validSize(destinationWidth, destinationHeight, 1)) {
    throw new RangeError('mask-scale目标WH取整为零或超出1..32766/80MP');
  }
  const span = (height - 1) * stride + width;
  if (!Number.isSafeInteger(stride) || stride < width || !Number.isSafeInteger(span) || data.length < span) {
    throw new RangeError('mask-scale stride或最后有效行范围无效');
  }
  const output = new Uint8Array(destinationWidth * destinationHeight);
  if (destinationWidth === width && destinationHeight === height) {
    for (let y = 0; y < height; y++) output.set(data.subarray(y * stride, y * stride + width), y * width);
  } else if (scale === .5) {
    for (let y = 0; y < destinationHeight; y++) for (let x = 0; x < destinationWidth; x++) {
      const endY = Math.min(height, 2 * y + 2), endX = Math.min(width, 2 * x + 2);
      let sum = 0, count = 0;
      for (let sy = 2 * y; sy < endY; sy++) for (let sx = 2 * x; sx < endX; sx++) {
        sum += data[sy * stride + sx]; count++;
      }
      // 完整2×2 half-up；奇数边缘count1/2，FLOAT除法后的RNE。
      output[y * destinationWidth + x] = count === 4 ? (sum + 2) >> 2 : nearestEven(f(f(sum) / f(count)));
    }
  } else {
    const xp = axis(width, destinationWidth, scale, true), yp = axis(height, destinationHeight, scale, false);
    for (let y = 0; y < destinationHeight; y++) {
      const [iy, b0, b1] = yp[y];
      const row0 = Math.max(0, Math.min(height - 1, iy)) * stride;
      const row1 = Math.max(0, Math.min(height - 1, iy + 1)) * stride;
      for (let x = 0; x < destinationWidth; x++) {
        const [ix, a0, a1] = xp[x], next = Math.min(width - 1, ix + 1);
        const h0 = data[row0 + ix] * a0 + data[row0 + next] * a1;
        const h1 = data[row1 + ix] * a0 + data[row1 + next] * a1;
        output[y * destinationWidth + x] = (((h0 >> 4) * b0 >> 16) + ((h1 >> 4) * b1 >> 16) + 2) >> 2;
      }
    }
  }
  return { data: output, width: destinationWidth, height: destinationHeight, stride: destinationWidth, scale };
}

module.exports = { scaleSuppliedReferenceMask };
