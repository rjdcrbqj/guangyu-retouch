'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const { getOpenCV } = require('../opencv-runtime.cjs');
const model = require('./model.json');
const { modelEdge, selectionBounds, contextBox, workingRegion, packPixels, renderPixels, copyPatch } = require('./pixels.cjs');
const { orientedPhoto, applyPatches } = require('./patches.cjs');

function validatedSelection({ width, height, rect, mask, patches = [] } = {}) {
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= 32766)
      || width * height > 80_000_000) throw new RangeError('照片尺寸无效');
  if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isSafeInteger)
      || rect.left < 0 || rect.top < 0 || rect.width < 1 || rect.height < 1
      || rect.left + rect.width > width || rect.top + rect.height > height
      || !(mask instanceof Uint8Array) || mask.length !== rect.width * rect.height) {
    throw new RangeError('移除选区无效');
  }
  if (mask.length > 8_000_000) throw new RangeError('选区超过 800 万像素，请分次移除');
  return { width, height, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, mask, patches };
}

class PublicInpaintService {
  constructor({ modelFile = path.join(__dirname, model.file) } = {}) {
    this.modelFile = modelFile;
    this.sessionPromise = null;
    this.active = null;
    this.closed = false;
  }

  loadSession() {
    this.sessionPromise ??= (async () => {
      const binary = await fs.readFile(this.modelFile);
      if (createHash('sha256').update(binary).digest('hex') !== model.sha256) throw new Error('物体移除模型校验失败');
      return ort.InferenceSession.create(binary, {
        executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1, graphOptimizationLevel: 'basic',
      });
    })().catch(error => { this.sessionPromise = null; throw error; });
    return this.sessionPromise;
  }

  async repair(original, selection) {
    if (this.closed) throw new Error('物体移除已关闭');
    if (this.active) throw new Error('正在移除物体，请稍候');
    const request = validatedSelection(selection);
    const pending = this.run(original, request);
    this.active = pending;
    try { return await pending; }
    finally { this.active = null; }
  }

  async run(original, { width, height, rect, mask, patches }) {
    const started = performance.now();
    const photo = await orientedPhoto(original, width, height);
    const result = (png = null, changedPixels = 0) => ({ png, rect, changedPixels, seconds: (performance.now() - started) / 1000 });
    const bounds = selectionBounds(mask, rect);
    if (!bounds) return result();
    const context = contextBox(bounds, rect, width, height);
    const { data, info } = await photo.extract(context).toColourspace('srgb').ensureAlpha()
      .raw().toBuffer({ resolveWithObject: true });
    if (info.width !== context.width || info.height !== context.height || info.channels !== 4) {
      throw new Error('物体移除照片解码失败');
    }
    await applyPatches(data, context, patches, width, height);
    const region = workingRegion(data, context, rect, mask);
    if (!region) return result();
    const [cv, session] = await Promise.all([getOpenCV(), this.loadSession()]);
    const input = new ort.Tensor('float32', packPixels(cv, region), [1, 4, modelEdge, modelEdge]);
    const { repaired } = await session.run({ source: input }, ['repaired']);
    const { dims, data: prediction } = repaired;
    if (dims.length !== 4 || dims[0] !== 1 || dims[1] !== 3 || dims[2] !== modelEdge || dims[3] !== modelEdge
        || !prediction.every(Number.isFinite)) throw new Error('物体移除模型输出无效');
    const rendered = renderPixels(cv, prediction, region);
    const { result: pixels, changed } = copyPatch(data, context, rect, mask, region, rendered);
    if (!changed) return result();
    const png = await sharp(pixels, { raw: { width: rect.width, height: rect.height, channels: 4 } }).png().toBuffer();
    return result(png, changed);
  }

  async close() {
    this.closed = true;
    this.closing ??= (async () => {
      await this.active?.catch(() => {});
      const session = await this.sessionPromise?.catch(() => null);
      await session?.release();
    })();
    return this.closing;
  }
}

module.exports = { PublicInpaintService };
