'use strict';
const sharp = require('sharp');
const { PublicFaceDetector } = require('./public-yunet/detector.cjs');
const { PublicPortraitSegmenter } = require('./public-segmentation/service.cjs');
const { correctFrame } = require('./public-frame-worker.cjs');

async function faceRegion(segmented, width, height, mw, mh) {
  if (segmented.width !== mw || segmented.height !== mh) throw Error('皮肤修饰分区尺寸不一致');
  const { data: mask, info } = await sharp(Buffer.from(segmented.mask, 'base64'), {
    limitInputPixels: 1600 * 1600,
  })
    .extractChannel('alpha')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || info.width !== mw || info.height !== mh) throw Error('皮肤修饰分区格式无效');
  let left = mw,
    top = mh,
    right = -1,
    bottom = -1;
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++)
      if (mask[y * mw + x] > 160) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  if (right < left) return null;
  // Include the interpolation footprint when mapping the preview mask to the original.
  const x0 = Math.max(0, Math.floor(((left - 0.5) * width) / mw)),
    y0 = Math.max(0, Math.floor(((top - 0.5) * height) / mh));
  const x1 = Math.min(width, Math.ceil(((right + 1.5) * width) / mw)),
    y1 = Math.min(height, Math.ceil(((bottom + 1.5) * height) / mh));
  return {
    crop: { left: x0, top: y0, width: x1 - x0, height: y1 - y0 },
    mask,
    maskWidth: mw,
    maskHeight: mh,
  };
}
class PublicSkinEffectService {
  constructor(
    workflow,
    { detector = new PublicFaceDetector(), segmentation = new PublicPortraitSegmenter() } = {},
  ) {
    this.workflow = workflow;
    this.detector = detector;
    this.segmentation = segmentation;
    this.closed = false;
    this.active = null;
    this.closing = null;
  }
  async repair(bytes, options = {}) {
    if (this.closed) throw Error(this.workflow.label + '服务已关闭');
    if (this.active) throw Error(this.workflow.label + '正在处理，请稍候');
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 64 * 1024 * 1024)
      throw Error('照片内容无效');
    const strength = this.workflow.settings(options);
    const start = performance.now();
    let done;
    this.active = new Promise((resolve) => {
      done = resolve;
    });
    try {
      const {
        data,
        info: { width, height, channels },
      } = await sharp(bytes, { limitInputPixels: 80000000, failOn: 'error' })
        .rotate()
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (channels !== 4 || ![width, height].every((n) => n >= 2 && n <= 32766))
        throw Error('皮肤修饰照片尺寸无效');
      const frame = { data, width, height },
        found = await this.detector.detect(frame);
      if (found.width !== width || found.height !== height) throw Error('皮肤修饰找脸尺寸不一致');
      const scale = Math.min(1, 1600 / Math.max(width, height)),
        mw = Math.max(1, Math.round(width * scale)),
        mh = Math.max(1, Math.round(height * scale)),
        regions = [];
      for (const box of found.boxes.slice(0, 8)) {
        let segmented;
        try {
          segmented = await this.segmentation.segment(frame, box, mw, mh, 'skin', {
            protectNostrils: !!this.workflow.protectNostrils,
            includeGeometry: Boolean(this.workflow.geometry),
          });
        } catch (e) {
          if (e.code === 'ERR_PUBLIC_LANDMARKS_UNRELIABLE') continue;
          throw e;
        }
        const region = await faceRegion(segmented, width, height, mw, mh);
        if (region)
          regions.push({
            ...region,
            box,
            ...(this.workflow.geometry ? { zones: this.workflow.geometry(segmented.geometry) } : {}),
          });
      }
      const { output, faces, changedRGBFields } = regions.length
        ? await correctFrame(this.workflow.worker, frame, regions, strength)
        : { faces: [], changedRGBFields: 0 };
      const png = output
        ? await sharp(output, { raw: { width, height, channels: 4 } })
            .png()
            .toBuffer()
        : Buffer.alloc(0);
      return {
        png,
        width,
        height,
        faces,
        changedRGBFields,
        processedFaces: faces.length,
        detectedFaces: found.boxes.length,
        seconds: (performance.now() - start) / 1000,
        backend: this.workflow.backend,
        nativeApplicationParity: false,
      };
    } finally {
      this.active = null;
      done();
    }
  }
  async close() {
    this.closed = true;
    if (!this.closing)
      this.closing = (async () => {
        await this.active;
        await Promise.all([this.detector.close(), this.segmentation.close()]);
      })();
    return this.closing;
  }
}
module.exports = { PublicSkinEffectService };
