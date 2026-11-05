'use strict';
const sharp = require('sharp'),
  { PublicFaceDetector } = require('../public-yunet/detector.cjs'),
  { PublicFaceLandmarks } = require('../public-landmarks/service.cjs'),
  { PublicFaceLandmarks66 } = require('../public-face66/service.cjs'),
  { prepareLips } = require('./geometry.cjs'),
  { correctFrame } = require('../public-frame-worker.cjs');
function strengthFromPercent(value) {
  const strength = Math.fround(value / 100);
  if (typeof value !== 'number' || !Number.isFinite(value) || value > 100 || !(strength > 0.005))
    throw Error('请把唇纹强度设置为1至100');
  return strength;
}
class PublicLipWrinkleService {
  constructor({
    detector = new PublicFaceDetector(),
    landmarks = new PublicFaceLandmarks(),
    fallback = new PublicFaceLandmarks66(),
  } = {}) {
    this.detector = detector;
    this.landmarks = landmarks;
    this.fallback = fallback;
    this.closed = false;
    this.running = false;
    this.active = null;
    this.closing = null;
  }
  async repair(bytes, options = {}) {
    if (this.closed) throw Error('唇纹服务已关闭');
    if (this.running) throw Error('唇纹正在处理，请稍候');
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 64 * 1024 * 1024)
      throw Error('照片内容无效');
    const strength = strengthFromPercent(options.strengthPercent);
    this.running = true;
    let finish;
    this.active = new Promise((r) => (finish = r));
    const start = performance.now();
    try {
      const { data, info } = await sharp(bytes, { limitInputPixels: 80000000, failOn: 'error' })
          .rotate()
          .toColourspace('srgb')
          .ensureAlpha()
          .raw({ depth: 'uchar' })
          .toBuffer({ resolveWithObject: true }),
        { width, height } = info;
      if (info.channels !== 4 || ![width, height].every((n) => n >= 2 && n <= 32766))
        throw Error('唇纹照片尺寸无效');
      const frame = { data, width, height },
        found = await this.detector.detect(frame);
      if (found.width !== width || found.height !== height) throw Error('嘴唇定位与照片尺寸不一致');
      const regions = [];
      for (const box of found.boxes.slice(0, 8)) {
        let face;
        try {
          face = await this.landmarks.detect(frame, box);
        } catch (error) {
          if (error.code !== 'ERR_PUBLIC_LANDMARKS_UNRELIABLE') throw error;
          face = await this.fallback.detect(frame, box);
        }
        if (face.width !== width || face.height !== height) throw Error('嘴唇定位与照片尺寸不一致');
        const geometry = prepareLips(face);
        if (geometry) regions.push({ geometry, landmarkFormat: face.type });
      }
      const { faces, changedRGBFields, output } = regions.length
        ? await correctFrame(require.resolve('./worker.cjs'), frame, regions, strength)
        : { faces: [], changedRGBFields: 0 };
      const png = faces.length
        ? await sharp(output, { raw: { width, height, channels: 4 } })
            .png()
            .toBuffer()
        : Buffer.alloc(0);
      return {
        png,
        width,
        height,
        processedFaces: faces.length,
        detectedFaces: found.boxes.length,
        faces,
        changedRGBFields,
        seconds: (performance.now() - start) / 1000,
        backend: 'public-lip-line-correction',
        nativeApplicationParity: false,
      };
    } finally {
      this.running = false;
      finish();
    }
  }
  async close() {
    this.closed = true;
    if (!this.closing)
      this.closing = (async () => {
        await this.active;
        await Promise.all([this.detector.close(), this.landmarks.close(), this.fallback.close()]);
      })();
    return this.closing;
  }
}
module.exports = { PublicLipWrinkleService, strengthFromPercent };
