'use strict';

const CLASS_COUNT = 251;
const SKY_CATEGORY = 187; // COCO panoptic 的 sky-other-merged。
const MAX_MODEL_EDGE = 800;
const MAX_MASK_EDGE = 1600;

function skyInputSize(width, height) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0)) throw new Error('照片尺寸无效');
  const ratio = MAX_MODEL_EDGE / Math.max(width, height);
  const aligned = value => Math.max(32, Math.round(value * ratio / 32) * 32);
  return { width: aligned(width), height: aligned(height) };
}

function skyProbabilities({ logits, pred_masks: masks } = {}) {
  const [batch, queries, classes] = logits?.dims ?? [];
  const [maskBatch, maskQueries, height, width] = masks?.dims ?? [];
  if (logits?.dims?.length !== 3 || masks?.dims?.length !== 4 || batch !== 1 || maskBatch !== 1 ||
      !Number.isInteger(queries) || queries < 1 || queries > 100 || maskQueries !== queries || classes !== CLASS_COUNT ||
      ![width, height].every(value => Number.isInteger(value) && value > 0 && value <= MAX_MODEL_EDGE / 4) ||
      !(logits.data instanceof Float32Array) || !(masks.data instanceof Float32Array) ||
      logits.data.length !== queries * classes || masks.data.length !== queries * width * height ||
      !logits.data.every(Number.isFinite) || !masks.data.every(Number.isFinite)) {
    throw new Error('天空识别输出无效');
  }
  const size = width * height;
  const values = new Float32Array(size), winningScores = new Float32Array(size);
  const accepted = [];
  for (let query = 0; query < queries; query++) {
    const offset = query * classes;
    let topClass = 0;
    for (let label = 1; label < classes; label++) {
      if (logits.data[offset + label] > logits.data[offset + topClass]) topClass = label;
    }
    if (topClass === CLASS_COUNT - 1) continue;
    const peak = logits.data[offset + topClass];
    let likelihood = 0;
    for (let label = 0; label < classes; label++) likelihood += Math.exp(logits.data[offset + label] - peak);
    const confidence = 1 / likelihood;
    if (confidence >= .5) accepted.push({ query, topClass, confidence });
  }
  if (!accepted.some(({ topClass }) => topClass === SKY_CATEGORY)) return { values, width, height };
  // 同像素竞争保留建筑、人物等强候选，避免所有天空查询无条件相并。
  for (const { query, topClass, confidence } of accepted) {
    for (let pixel = 0; pixel < size; pixel++) {
      const probability = 1 / (1 + Math.exp(-masks.data[query * size + pixel]));
      const score = probability * confidence;
      if (score <= winningScores[pixel]) continue;
      winningScores[pixel] = score;
      values[pixel] = topClass === SKY_CATEGORY ? probability : 0;
    }
  }
  return { values, width, height };
}

function checkSkyMaskSize(width, height) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= MAX_MASK_EDGE)) {
    throw new Error('天空蒙版尺寸无效');
  }
}

function interpolation(size, destination) {
  return Array.from({ length: destination }, (_, index) => {
    const coordinate = Math.max(0, Math.min(size - 1, (index + .5) * size / destination - .5));
    const first = Math.floor(coordinate);
    return [first, Math.min(first + 1, size - 1), coordinate - first];
  });
}

function projectSkyAlpha({ values, width: columns, height: rows }, width, height, sourceAlpha) {
  checkSkyMaskSize(width, height);
  if (!(values instanceof Float32Array) || ![columns, rows].every(value => Number.isInteger(value) && value > 0 && value <= MAX_MODEL_EDGE / 4) ||
      values.length !== columns * rows || !values.every(value => Number.isFinite(value) && value >= 0 && value <= 1) ||
      (sourceAlpha !== undefined && (!(sourceAlpha instanceof Uint8Array) || sourceAlpha.length !== width * height))) {
    throw new Error('天空蒙版数据无效');
  }
  const alpha = Buffer.alloc(width * height);
  if (!values.some(value => value > .18)) return alpha;
  const matte = values.map(probability => {
    const strength = Math.max(0, Math.min(1, (probability - .18) / (.80 - .18)));
    return strength * strength * (3 - 2 * strength) * 255;
  });
  const xWeights = interpolation(columns, width);
  const yWeights = interpolation(rows, height);
  for (let y = 0; y < height; y++) {
    const [top, bottom, dy] = yWeights[y];
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (sourceAlpha?.[pixel] === 0) continue;
      const [left, right, dx] = xWeights[x];
      const a = matte[top * columns + left] * (1 - dx) + matte[top * columns + right] * dx;
      const b = matte[bottom * columns + left] * (1 - dx) + matte[bottom * columns + right] * dx;
      alpha[pixel] = Math.round(a * (1 - dy) + b * dy);
    }
  }
  return alpha;
}

module.exports = { skyInputSize, skyProbabilities, checkSkyMaskSize, projectSkyAlpha };
