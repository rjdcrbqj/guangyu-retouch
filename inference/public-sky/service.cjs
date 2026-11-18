'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const { openPublicPhoto } = require('../public-photo.cjs');
const model = require('./model.json');
const { skyInputSize, skyProbabilities, checkSkyMaskSize, projectSkyAlpha } = require('./geometry.cjs');

function packRgb(rgb, width, height) {
  const pixels = width * height;
  const means = [.485, .456, .406], deviations = [.229, .224, .225];
  const values = new Float32Array(pixels * 3);
  for (let channel = 0; channel < 3; channel++) {
    for (let i = 0; i < pixels; i++) {
      values[channel * pixels + i] = (rgb[i * 3 + channel] / 255 - means[channel]) / deviations[channel];
    }
  }
  return new ort.Tensor('float32', values, [1, 3, height, width]);
}

class PublicSkyService {
  constructor({ modelFile = path.join(__dirname, model.file) } = {}) {
    this.modelFile = modelFile;
    this.sessionPromise = null;
    this.active = null;
    this.closed = false;
  }

  loadSession() {
    this.sessionPromise ??= (async () => {
      const bytes = await fs.readFile(this.modelFile);
      if (createHash('sha256').update(bytes).digest('hex') !== model.sha256) throw new Error('公开天空模型校验失败');
      // 该上游 ONNX 导出在完整优化下会重写不兼容的 FP16 算子。
      return ort.InferenceSession.create(bytes, {
        executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1, graphOptimizationLevel: 'basic',
      });
    })().catch(error => { this.sessionPromise = null; throw error; });
    return this.sessionPromise;
  }

  async segment(bytes, width, height) {
    if (this.closed) throw new Error('天空识别已关闭');
    if (this.active) throw new Error('正在识别天空，请稍候');
    checkSkyMaskSize(width, height);
    const task = this.run(bytes, width, height);
    this.active = task;
    try { return await task; }
    finally { this.active = null; }
  }

  async run(bytes, width, height) {
    const started = performance.now();
    const photo = openPublicPhoto(bytes);
    const metadata = await photo.metadata();
    const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
    const size = skyInputSize(rotated ? metadata.height : metadata.width, rotated ? metadata.width : metadata.height);
    const rgb = await photo.clone().rotate().flatten({ background: '#000000' }).toColourspace('srgb').removeAlpha()
      .resize({ ...size, fit: 'fill', kernel: 'linear', fastShrinkOnLoad: false }).raw().toBuffer();
    if (rgb.length !== size.width * size.height * 3) throw new Error('天空识别照片颜色格式无效');
    const session = await this.loadSession();
    const pixelMask = new BigInt64Array(64 * 64).fill(1n);
    const output = await session.run({
      pixel_values: packRgb(rgb, size.width, size.height),
      pixel_mask: new ort.Tensor('int64', pixelMask, [1, 64, 64]),
    }, ['logits', 'pred_masks']);
    const probability = skyProbabilities(output);
    const sourceAlpha = metadata.hasAlpha && probability.values.some(value => value > .18)
      ? await photo.clone().rotate().resize({ width, height, fit: 'fill', kernel: 'linear' }).extractChannel('alpha').raw().toBuffer()
      : undefined;
    const alpha = projectSkyAlpha(probability, width, height, sourceAlpha);
    const rgba = Buffer.alloc(width * height * 4, 255);
    let coverage = 0;
    for (let i = 0; i < alpha.length; i++) {
      rgba[i * 4 + 3] = alpha[i];
      if (alpha[i] >= 128) coverage++;
    }
    const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
    return { mask: png.toString('base64'), width, height, foregroundFraction: coverage / alpha.length,
      seconds: (performance.now() - started) / 1000 };
  }

  async close() {
    this.closed = true;
    this.closing ??= (async () => {
      await this.active?.catch(() => {});
      const session = await this.sessionPromise?.catch(() => null);
      this.sessionPromise = null;
      await session?.release();
    })();
    return this.closing;
  }
}

module.exports = { PublicSkyService };
