'use strict';
function sample(a, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return null;
  const ix = Math.floor(x),
    iy = Math.floor(y),
    jx = Math.min(w - 1, ix + 1),
    jy = Math.min(h - 1, iy + 1),
    dx = x - ix,
    dy = y - iy;
  return (
    a[iy * w + ix] * (1 - dx) * (1 - dy) +
    a[iy * w + jx] * dx * (1 - dy) +
    a[jy * w + ix] * (1 - dx) * dy +
    a[jy * w + jx] * dx * dy
  );
}
function softenLipLines({ rgb, mask, width, height, mouthWidth, u, strength }) {
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw Error('唇纹强度无效');
  if (
    ![width, height].every((v) => Number.isInteger(v) && v > 0 && v <= 1024) ||
    !(rgb instanceof Uint8Array) ||
    rgb.length !== width * height * 3 ||
    !(mask instanceof Float32Array) ||
    mask.length !== width * height ||
    !mask.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ||
    !Number.isFinite(mouthWidth) ||
    mouthWidth < 1 ||
    mouthWidth > 2048 ||
    !Array.isArray(u) ||
    u.length !== 2 ||
    !u.every(Number.isFinite) ||
    Math.abs(Math.hypot(...u) - 1) > 0.001
  )
    throw Error('公开唇纹工作数据无效');
  const n = width * height,
    gain = new Float32Array(n),
    luma = new Float32Array(n),
    red = new Float32Array(n),
    blue = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3],
      g = rgb[i * 3 + 1],
      b = rgb[i * 3 + 2],
      sum = r + g + b;
    luma[i] = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    if (sum) {
      red[i] = r / sum;
      blue[i] = b / sum;
    }
  }
  const target = new Float32Array(luma);
  if (!strength || mouthWidth < 24) return { gain, target, changed: 0 };
  const radii = [Math.max(1, mouthWidth * 0.012), Math.max(2, mouthWidth * 0.024)],
    step = Math.max(1.5, mouthWidth * 0.01),
    directions = [-Math.PI / 6, 0, Math.PI / 6].map((a) => {
      const c = Math.cos(a),
        s = Math.sin(a);
      return {
        across: [u[0] * c + u[1] * s, u[1] * c - u[0] * s],
        along: [-u[1] * c + u[0] * s, u[0] * c + u[1] * s],
      };
    });
  // Require every pixel contributing to an interpolated reference to be lip tissue.
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return false;
    const a = Math.floor(x),
      b = Math.floor(y),
      c = Math.ceil(x),
      d = Math.ceil(y);
    return (
      mask[b * width + a] > 0 && mask[b * width + c] > 0 && mask[d * width + a] > 0 && mask[d * width + c] > 0
    );
  };
  const connected = (x, y, dx, dy) => {
    const steps = Math.ceil(Math.hypot(dx, dy));
    for (let i = 1; i <= steps; i++) if (!inside(x + (dx * i) / steps, y + (dy * i) / steps)) return false;
    return true;
  };
  const probe = (x, y) => {
    if (!inside(x, y) || sample(mask, width, height, x, y) < 0.65) return null;
    return {
      l: sample(luma, width, height, x, y),
      r: sample(red, width, height, x, y),
      b: sample(blue, width, height, x, y),
    };
  };
  const deficit = (x, y, axis) => {
    const center = probe(x, y);
    if (!center || center.l < 0.05) return 0;
    let best = 0;
    for (const radius of radii) {
      const a = probe(x - axis[0] * radius, y - axis[1] * radius),
        b = probe(x + axis[0] * radius, y + axis[1] * radius);
      if (
        !a ||
        !b ||
        Math.max(
          Math.abs(a.r - center.r),
          Math.abs(b.r - center.r),
          Math.abs(a.b - center.b),
          Math.abs(b.b - center.b),
        ) > 0.08
      )
        continue;
      const d = Math.min(a.l, b.l) - center.l;
      if (
        d > Math.max(best, 0.006, center.l * 0.025) &&
        connected(x, y, axis[0] * radius, axis[1] * radius) &&
        connected(x, y, -axis[0] * radius, -axis[1] * radius)
      )
        best = Math.max(best, d);
    }
    return best;
  };
  let changed = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] < 0.65 || luma[i] < 0.05) continue;
      let coherent = 0;
      for (const d of directions) {
        const center = deficit(x, y, d.across);
        if (!center) continue;
        const dx = d.along[0] * step,
          dy = d.along[1] * step,
          above = connected(x, y, dx, dy) ? deficit(x + dx, y + dy, d.across) : 0,
          below = connected(x, y, -dx, -dy) ? deficit(x - dx, y - dy, d.across) : 0;
        coherent = Math.max(coherent, Math.min(center, Math.max(above, below)));
      }
      if (!coherent) continue;
      const maximum = Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]),
        amount = Math.min(0.2, coherent / luma[i]) * 0.7 * strength * mask[i];
      gain[i] = Math.max(0, Math.min(amount, maximum ? 255 / maximum - 1 : 0));
      target[i] = luma[i] + coherent;
      if (maximum * gain[i] >= 0.5) changed++;
    }
  return { gain, target, changed };
}
module.exports = { softenLipLines, sample };
