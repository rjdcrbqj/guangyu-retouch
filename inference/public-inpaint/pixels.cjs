'use strict';

const modelEdge = 512;
const workEdge = 1280;

function selectionBounds(mask, rect) {
  let left = rect.width, top = rect.height, right = 0, bottom = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const y = Math.floor(i / rect.width), x = i - y * rect.width;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + 1);
    bottom = Math.max(bottom, y + 1);
  }
  if (!right) return null;
  return { left: rect.left + left, top: rect.top + top, width: right - left, height: bottom - top };
}

function contextBox(bounds, rect, width, height) {
  const side = Math.max(160, Math.ceil(Math.max(bounds.width, bounds.height) * 2.6));
  const cols = Math.min(side, width), rows = Math.min(side, height);
  const x = Math.min(Math.max(0, bounds.left + Math.floor((bounds.width - cols) / 2)), width - cols);
  const y = Math.min(Math.max(0, bounds.top + Math.floor((bounds.height - rows) / 2)), height - rows);
  const left = Math.min(x, rect.left), top = Math.min(y, rect.top);
  return { left, top, width: Math.max(x + cols, rect.left + rect.width) - left,
    height: Math.max(y + rows, rect.top + rect.height) - top };
}

function workingRegion(source, context, rect, mask) {
  const scale = Math.min(1, workEdge / Math.max(context.width, context.height));
  const width = Math.max(1, Math.round(context.width * scale));
  const height = Math.max(1, Math.round(context.height * scale));
  const known = new Float32Array(width * height);
  const weighted = new Float32Array(known.length * 3);
  const rgb = new Uint8Array(weighted.length);
  const holes = new Uint8Array(known.length);
  let visibleSelection = false, visibleContext = false;
  const maskX = rect.left - context.left, maskY = rect.top - context.top;
  const boundedMask = (x, y) => x >= 0 && x < rect.width && y >= 0 && y < rect.height && mask[y * rect.width + x] > 0;
  // 缩小大上下文时只累计未选中的可见原像素，避免选中物体漏进推理输入。
  for (let y = 0; y < height; y++) {
    const top = Math.floor(y * context.height / height), bottom = Math.floor((y + 1) * context.height / height);
    for (let x = 0; x < width; x++) {
      const left = Math.floor(x * context.width / width), right = Math.floor((x + 1) * context.width / width);
      let red = 0, green = 0, blue = 0, available = 0, selected = false;
      for (let sy = top; sy < bottom; sy++) {
        for (let sx = left; sx < right; sx++) {
          const from = (sy * context.width + sx) * 4;
          const inMask = boundedMask(sx - maskX, sy - maskY);
          if (!source[from + 3]) continue;
          if (inMask) {
            visibleSelection = true;
            selected = true;
          } else {
            available++;
            red += source[from];
            green += source[from + 1];
            blue += source[from + 2];
          }
        }
      }
      const pixel = y * width + x;
      if (selected || available < (bottom - top) * (right - left) * .875) {
        holes[pixel] = 255;
        continue;
      }
      visibleContext = true;
      known[pixel] = 1;
      const i = pixel * 3;
      weighted[i] = red / available;
      weighted[i + 1] = green / available;
      weighted[i + 2] = blue / available;
      for (let channel = 0; channel < 3; channel++) rgb[i + channel] = Math.round(weighted[i + channel]);
    }
  }
  if (!visibleSelection || !visibleContext) return null;
  return { width, height, known, weighted, rgb, holes };
}

function withMats(run) {
  const matrices = [];
  const own = mat => (matrices.push(mat), mat);
  try { return run(own); }
  finally { for (const mat of matrices.reverse()) mat.delete(); }
}

function packPixels(cv, { width, height, known, weighted }) {
  return withMats(own => {
    const coverage = own(new cv.Mat()), reduced = own(new cv.Mat());
    const sourceKnown = own(cv.matFromArray(height, width, cv.CV_32FC1, known));
    const sourceWeighted = own(cv.matFromArray(height, width, cv.CV_32FC3, weighted));
    const size = new cv.Size(modelEdge, modelEdge);
    const interpolation = Math.min(width, height) >= modelEdge ? cv.INTER_AREA : cv.INTER_LINEAR;
    cv.resize(sourceKnown, coverage, size, 0, 0, interpolation);
    cv.resize(sourceWeighted, reduced, size, 0, 0, interpolation);
    const pixels = modelEdge * modelEdge;
    const packed = new Float32Array(4 * pixels);
    const weights = coverage.data32F, colors = reduced.data32F;
    for (let pixel = 0; pixel < pixels; pixel++) {
      const visible = weights[pixel] >= .875;
      packed[pixel] = visible ? .5 : -.5;
      if (!visible) continue;
      for (let ch = 0; ch < 3; ch++) packed[(ch + 1) * pixels + pixel] = colors[pixel * 3 + ch] / weights[pixel] * (2 / 255) - 1;
    }
    return packed;
  });
}

function renderPixels(cv, prediction, { width, height, rgb, holes }) {
  return withMats(own => {
    const interleaved = new Float32Array(prediction.length);
    const plane = modelEdge * modelEdge;
    for (let pixel = 0; pixel < plane; pixel++) {
      for (let ch = 0; ch < 3; ch++) interleaved[pixel * 3 + ch] = (prediction[ch * plane + pixel] * .5 + .5) * 255;
    }
    const input = own(cv.matFromArray(modelEdge, modelEdge, cv.CV_32FC3, interleaved));
    const resized = own(new cv.Mat());
    cv.resize(input, resized, new cv.Size(width, height), 0, 0, cv.INTER_CUBIC);
    const hole = own(cv.matFromArray(height, width, cv.CV_8UC1, holes));
    const knownRgb = own(cv.matFromArray(height, width, cv.CV_8UC3, rgb));
    const local = own(new cv.Mat()), distance = own(new cv.Mat()), radius = own(new cv.Mat());
    const kernel = own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(25, 25)));
    cv.inpaint(knownRgb, hole, local, 3, cv.INPAINT_TELEA);
    cv.distanceTransform(hole, distance, cv.DIST_L2, cv.DIST_MASK_5);
    cv.dilate(distance, radius, kernel);
    const values = new Float32Array(resized.data32F), replacement = local.data;
    const distances = distance.data32F, radii = radius.data32F;
    for (let pixel = 0; pixel < holes.length; pixel++) {
      if (!holes[pixel]) continue;
      // 窄选区保留模型轮廓，宽选区仅在内侧边缘借用原图邻域。
      const t = Math.min(1, Math.max(0, (radii[pixel] - 7) / 8));
      const amount = Math.max(0, 1 - distances[pixel] / 12) ** 2 * t ** 2 * (3 - 2 * t);
      for (let ch = 0; ch < 3; ch++) {
        const i = pixel * 3 + ch;
        values[i] += (replacement[i] - values[i]) * amount;
      }
    }
    return values;
  });
}

function sampleRgb(values, width, x, y, rgb) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const weightX = x - x0, weightY = y - y0;
  const topLeft = (y0 * width + x0) * 3;
  const right = weightX ? 3 : 0, down = weightY ? width * 3 : 0;
  for (let ch = 0; ch < 3; ch++) {
    const i = topLeft + ch;
    const top = values[i] * (1 - weightX) + values[i + right] * weightX;
    const bottom = values[i + down] * (1 - weightX) + values[i + down + right] * weightX;
    rgb[ch] = top * (1 - weightY) + bottom * weightY;
  }
}

function copyPatch(source, context, rect, mask, region, values) {
  const result = Buffer.alloc(rect.width * rect.height * 4);
  const x = rect.left - context.left, y = rect.top - context.top;
  const map = (coordinate, pixels, native) => Math.min(pixels - 1, Math.max(0, (coordinate + .5) * pixels / native - .5));
  const mappedX = Float64Array.from({ length: rect.width }, (_, col) => map(x + col, region.width, context.width));
  const color = new Float32Array(3);
  let changed = 0;
  for (let row = 0; row < rect.height; row++) {
    const from = ((y + row) * context.width + x) * 4;
    const to = row * rect.width * 4;
    source.copy(result, to, from, from + rect.width * 4);
    const v = map(y + row, region.height, context.height);
    for (let col = 0; col < rect.width; col++) {
      const strength = mask[row * rect.width + col] / 255;
      const i = to + col * 4;
      if (!strength || !result[i + 3]) continue;
      sampleRgb(values, region.width, mappedX[col], v, color);
      let edited = false;
      for (let ch = 0; ch < 3; ch++) {
        const estimate = Math.min(255, Math.max(0, color[ch]));
        const output = Math.round(result[i + ch] + (estimate - result[i + ch]) * strength);
        edited ||= output !== result[i + ch];
        result[i + ch] = output;
      }
      changed += Number(edited);
    }
  }
  return { result, changed };
}

module.exports = { modelEdge, selectionBounds, contextBox, workingRegion, packPixels, renderPixels, copyPatch };
