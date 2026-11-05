'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { lipWeight } = require('./geometry.cjs');
const { softenLipLines, sample } = require('./core.cjs');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function readPixel(data, w, h, x, y, out) {
  x = clamp(x, 0, w - 1);
  y = clamp(y, 0, h - 1);
  const ix = Math.floor(x),
    iy = Math.floor(y),
    jx = Math.min(w - 1, ix + 1),
    jy = Math.min(h - 1, iy + 1),
    dx = x - ix,
    dy = y - iy,
    indices = [(iy * w + ix) * 4, (iy * w + jx) * 4, (jy * w + ix) * 4, (jy * w + jx) * 4],
    weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
  let alpha = 0;
  for (let j = 0; j < 4; j++) alpha += data[indices[j] + 3] * weights[j];
  out[3] = alpha;
  for (let c = 0; c < 3; c++) {
    let value = 0;
    for (let j = 0; j < 4; j++) value += data[indices[j] + c] * data[indices[j] + 3] * weights[j];
    out[c] = alpha ? value / alpha : 0;
  }
}

const { data, width, height, regions, strength } = workerData;
const faces = [];
let changedRGBFields = 0,
  output;
for (const { geometry, landmarkFormat } of regions) {
  const { crop } = geometry,
    scale = Math.min(1, 1024 / Math.max(crop.width, crop.height)),
    w = Math.min(1024, Math.ceil(crop.width * scale)),
    h = Math.min(1024, Math.ceil(crop.height * scale)),
    rgb = Buffer.alloc(w * h * 3),
    mask = new Float32Array(w * h),
    pixel = new Float64Array(4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = crop.left + (x + 0.5) / scale - 0.5,
        sy = crop.top + (y + 0.5) / scale - 0.5,
        i = y * w + x;
      readPixel(data, width, height, sx, sy, pixel);
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(pixel[c]);
      mask[i] = pixel[3] > 0 ? lipWeight(geometry, sx + 0.5, sy + 0.5) : 0;
    }
  // A transparent source pixel blocks its whole working cell, even when
  // bilinear sampling at that cell's centre would have missed it.
  if (scale < 1) {
    for (let y = 0; y < crop.height; y++) {
      const row = Math.floor((y + 0.5) * scale) * w,
        offset = ((crop.top + y) * width + crop.left) * 4;
      for (let x = 0; x < crop.width; x++)
        if (!data[offset + x * 4 + 3]) mask[row + Math.floor((x + 0.5) * scale)] = 0;
    }
  }
  const result = softenLipLines({
    rgb,
    mask,
    width: w,
    height: h,
    mouthWidth: geometry.mouthWidth * scale,
    u: geometry.u,
    strength,
  });
  let changed = 0,
    fields = 0;
  if (result.changed)
    for (let y = crop.top; y < crop.top + crop.height; y++)
      for (let x = crop.left; x < crop.left + crop.width; x++) {
        const i = (y * width + x) * 4;
        if (!data[i + 3]) continue;
        const sx = (x + 0.5 - crop.left) * scale - 0.5,
          sy = (y + 0.5 - crop.top) * scale - 0.5,
          gain = sample(result.gain, w, h, sx, sy),
          target = sample(result.target, w, h, sx, sy);
        if (!(gain > 0) || target === null || lipWeight(geometry, x + 0.5, y + 0.5) <= 0) continue;
        const luma = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255,
          maximum = Math.max(data[i], data[i + 1], data[i + 2]);
        if (luma <= 0 || target <= luma) continue;
        const amount = Math.min(gain, (target - luma) / luma, 255 / maximum - 1);
        if (!output) output = new Uint8Array(data);
        let touched = false;
        for (let c = 0; c < 3; c++) {
          const value = Math.max(output[i + c], Math.min(255, Math.round(data[i + c] * (1 + amount))));
          if (value !== output[i + c]) {
            if (output[i + c] === data[i + c]) changedRGBFields++;
            output[i + c] = value;
            fields++;
            touched = true;
          }
        }
        if (touched) changed++;
      }
  if (changed) faces.push({ geometry, landmarkFormat, changed, changedRGBFields: fields });
}

parentPort.postMessage({ faces, changedRGBFields, output }, output ? [output.buffer] : []);
