'use strict';
const { confidence } = require('./public-skin-confidence.cjs');
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function workingSkin(frame, region) {
  const { width, height, data } = frame,
    { crop } = region,
    scale = Math.min(1, 640 / Math.max(crop.width, crop.height));
  const w = Math.ceil(crop.width * scale),
    h = Math.ceil(crop.height * scale),
    n = w * h;
  const rgb = new Float32Array(n * 3),
    visible = new Uint8Array(n),
    light = new Float32Array(n),
    red = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = crop.left + Math.floor((x * crop.width) / w),
        x1 = crop.left + Math.floor(((x + 1) * crop.width) / w);
      const y0 = crop.top + Math.floor((y * crop.height) / h),
        y1 = crop.top + Math.floor(((y + 1) * crop.height) / h);
      const p = y * w + x;
      let weight = 0,
        valid = true;
      // Average the actual footprint. A transparent slit must survive reducing a large face.
      for (let sy = y0; sy < y1; sy++)
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * width + sx) * 4,
            a = data[i + 3] / 255;
          if (!a) valid = false;
          weight += a;
          for (let c = 0; c < 3; c++) rgb[p * 3 + c] += a * data[i + c];
        }
      if (!valid || !weight || confidence(region, width, height, (x0 + x1 - 1) / 2, (y0 + y1 - 1) / 2) < 0.55)
        continue;
      for (let c = 0; c < 3; c++) rgb[p * 3 + c] /= weight;
      light[p] = luma(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);
      red[p] = rgb[p * 3] - rgb[p * 3 + 1];
      visible[p] = 1;
    }
  return { w, h, rgb, visible, light, red };
}
module.exports = { workingSkin };
