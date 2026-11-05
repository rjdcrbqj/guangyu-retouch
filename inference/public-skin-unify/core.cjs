'use strict';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Ordered sub-byte rounding keeps the first few slider positions effective on 8-bit exports.
const ranks = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const { confidence } = require('../public-skin-confidence.cjs');
// Estimate the underlying skin colour gradient for this face. Downweight larger
// chromatic residuals so that a local patch does not become its own reference.
function fitPlane(cells) {
  let red = [0, 0, 0],
    blue = [0, 0, 0];
  for (let iteration = 0; iteration < 4; iteration++) {
    const a = Array.from({ length: 3 }, () => new Float64Array(5));
    for (const c of cells) {
      const p = [1, c.x, c.y];
      const distance = Math.hypot(c.r - predict(red, c), c.b - predict(blue, c));
      const weight = c.coverage * (iteration === 0 ? 1 : Math.min(1, 0.025 / Math.max(distance, 1e-6)));
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) a[i][j] += weight * p[i] * p[j];
        a[i][3] += weight * p[i] * c.r;
        a[i][4] += weight * p[i] * c.b;
      }
    }
    for (let i = 0; i < 3; i++) {
      let pivot = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[pivot][i])) pivot = k;
      [a[i], a[pivot]] = [a[pivot], a[i]];
      const diagonal = a[i][i];
      if (Math.abs(diagonal) < 1e-5) return null;
      for (let j = i; j < 5; j++) a[i][j] /= diagonal;
      for (let k = 0; k < 3; k++)
        if (k !== i) {
          const v = a[k][i];
          for (let j = i; j < 5; j++) a[k][j] -= v * a[i][j];
        }
    }
    red = a.map((row) => row[3]);
    blue = a.map((row) => row[4]);
  }
  return { red, blue };
}
const predict = (p, c) => p[0] + p[1] * c.x + p[2] * c.y;
function sampleFace(frame, region) {
  const { data, width, height } = frame,
    { crop } = region;
  const cols = Math.min(24, Math.floor(crop.width / 4)),
    rows = Math.min(28, Math.floor(crop.height / 4));
  if (cols < 6 || rows < 6) return null;
  const grid = new Array(cols * rows),
    cells = [];
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) {
      const x0 = crop.left + Math.floor((gx * crop.width) / cols),
        x1 = crop.left + Math.floor(((gx + 1) * crop.width) / cols);
      const y0 = crop.top + Math.floor((gy * crop.height) / rows),
        y1 = crop.top + Math.floor(((gy + 1) * crop.height) / rows);
      const nx = Math.min(10, x1 - x0),
        ny = Math.min(10, y1 - y0);
      let sum = 0,
        red = 0,
        blue = 0,
        brightness = 0;
      for (let j = 0; j < ny; j++)
        for (let k = 0; k < nx; k++) {
          const x = x0 + Math.floor(((k + 0.5) * (x1 - x0)) / nx),
            y = y0 + Math.floor(((j + 0.5) * (y1 - y0)) / ny),
            i = (y * width + x) * 4;
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2],
            l = luminance(r, g, b);
          if (
            l < 20 ||
            l > 235 ||
            Math.max(r, g, b) > 250 ||
            Math.min(r, g, b) < 3 ||
            Math.max(r, g, b) - Math.min(r, g, b) < 4
          )
            continue;
          const weight = (confidence(region, width, height, x, y) * data[i + 3]) / 255;
          sum += weight;
          brightness += weight * l;
          red += (weight * (r - l)) / l;
          blue += (weight * (b - l)) / l;
        }
      const coverage = sum / (nx * ny);
      if (coverage < 0.4) continue;
      const cell = {
        x: (gx + 0.5) / cols - 0.5,
        y: (gy + 0.5) / rows - 0.5,
        r: red / sum,
        b: blue / sum,
        brightness: brightness / sum,
        coverage,
      };
      grid[gy * cols + gx] = cell;
      cells.push(cell);
    }
  if (cells.length < 16) return null;
  const plane = fitPlane(cells);
  if (!plane) return null;
  for (const c of cells) {
    const r = predict(plane.red, c) - c.r,
      b = predict(plane.blue, c) - c.b,
      dist = Math.hypot(r, b);
    // Ignore sub-byte noise and attenuate extreme hues, e.g. makeup or occlusion.
    const factor =
      dist > 0
        ? Math.max(0, 1 - 0.014 / dist) *
          clamp((0.52 - dist * Math.min(1, c.brightness / 100)) / 0.22, 0, 1) *
          0.65
        : 0;
    c.dr = r * factor;
    c.db = b * factor;
  }
  return { cols, rows, grid };
}
function correctSkinTone(frame, strength) {
  const { data, width, height, regions } = frame;
  if (
    !(data instanceof Uint8Array) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width * height > 80000000 ||
    data.length !== width * height * 4 ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    strength > 1
  )
    throw Error('肤色统一图像或强度无效');
  let output = null,
    changedRGBFields = 0;
  const faces = [];
  for (const region of regions) {
    const { crop, mask, maskWidth, maskHeight } = region;
    if (
      ![crop.left, crop.top, crop.width, crop.height, maskWidth, maskHeight].every(Number.isInteger) ||
      crop.left < 0 ||
      crop.top < 0 ||
      crop.width < 1 ||
      crop.height < 1 ||
      crop.left + crop.width > width ||
      crop.top + crop.height > height ||
      maskWidth < 1 ||
      maskHeight < 1 ||
      maskWidth > 1600 ||
      maskHeight > 1600 ||
      !(mask instanceof Uint8Array) ||
      mask.length !== maskWidth * maskHeight
    )
      throw Error('肤色统一选区无效');
    if (!strength) continue;
    const surface = sampleFace(frame, region);
    if (!surface) continue;
    const { grid, cols, rows } = surface;
    let changed = 0;
    for (let y = crop.top; y < crop.top + crop.height; y++)
      for (let x = crop.left; x < crop.left + crop.width; x++) {
        const i = (y * width + x) * 4,
          r = data[i],
          g = data[i + 1],
          b = data[i + 2],
          l = luminance(r, g, b);
        if (
          !data[i + 3] ||
          l < 20 ||
          l > 235 ||
          Math.max(r, g, b) > 250 ||
          Math.min(r, g, b) < 3 ||
          Math.max(r, g, b) - Math.min(r, g, b) < 4
        )
          continue;
        const coverage = confidence(region, width, height, x, y);
        if (!coverage) continue;
        const gx = clamp(((x + 0.5 - crop.left) * cols) / crop.width - 0.5, 0, cols - 1),
          gy = clamp(((y + 0.5 - crop.top) * rows) / crop.height - 0.5, 0, rows - 1);
        const left = Math.floor(gx),
          top = Math.floor(gy);
        let dr = 0,
          db = 0;
        for (let j = 0; j < 2; j++)
          for (let k = 0; k < 2; k++) {
            const cell = grid[Math.min(rows - 1, top + j) * cols + Math.min(cols - 1, left + k)];
            if (!cell) continue;
            const distance = Math.hypot((r - l) / l - cell.r, (b - l) / l - cell.b);
            const weight =
              (k ? gx - left : 1 - gx + left) *
              (j ? gy - top : 1 - gy + top) *
              clamp((0.25 - distance) / 0.15, 0, 1);
            dr += weight * cell.dr * l;
            db += weight * cell.db * l;
          }
        const dg = -(dr * 0.2126 + db * 0.0722) / 0.7152;
        let amount =
          ((strength * coverage * data[i + 3]) / 255) *
          Math.min(1, 14 / Math.max(1, Math.abs(dr), Math.abs(dg), Math.abs(db)));
        for (const [v, d] of [
          [r, dr],
          [g, dg],
          [b, db],
        ])
          if (d) amount = Math.min(amount, d > 0 ? (255 - v) / d : -v / d);
        const rounding = (ranks[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        const nr = Math.floor(r + dr * amount + rounding),
          nb = Math.floor(b + db * amount + rounding);
        const ng = Math.round(g - ((nr - r) * 0.2126 + (nb - b) * 0.0722) / 0.7152);
        const distance = Math.abs(nr - r) + Math.abs(ng - g) + Math.abs(nb - b);
        if (!distance) continue;
        if (!output) output = new Uint8Array(data);
        if (distance <= Math.abs(output[i] - r) + Math.abs(output[i + 1] - g) + Math.abs(output[i + 2] - b))
          continue;
        changedRGBFields +=
          (nr !== r) +
          (ng !== g) +
          (nb !== b) -
          (output[i] !== r) -
          (output[i + 1] !== g) -
          (output[i + 2] !== b);
        output[i] = nr;
        output[i + 1] = ng;
        output[i + 2] = nb;
        changed++;
      }
    if (changed) faces.push({ ROI: [crop.left, crop.top, crop.width, crop.height], changed });
  }
  return { output, faces, changedRGBFields };
}
module.exports = { correctSkinTone };
