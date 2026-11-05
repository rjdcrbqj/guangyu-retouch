'use strict';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function confidence(region, width, height, x, y) {
  const { mask, maskWidth: w, maskHeight: h } = region;
  const sx = clamp(((x + 0.5) * w) / width - 0.5, 0, w - 1),
    sy = clamp(((y + 0.5) * h) / height - 0.5, 0, h - 1);
  const left = Math.floor(sx),
    top = Math.floor(sy),
    right = Math.min(left + 1, w - 1),
    bottom = Math.min(top + 1, h - 1);
  const dx = sx - left,
    dy = sy - top;
  const v =
    (1 - dy) * (mask[top * w + left] * (1 - dx) + mask[top * w + right] * dx) +
    dy * (mask[bottom * w + left] * (1 - dx) + mask[bottom * w + right] * dx);
  return clamp((v - 160) / 80, 0, 1);
}
module.exports = { confidence };
