'use strict';

const sharp = require('sharp');
const { PublicHairEffectService } = require('../public-hair-effect-service.cjs');
const { hairColorSettings } = require('./core.cjs');

class PublicHairColorService extends PublicHairEffectService {
  constructor(dependencies) {
    super({ label: '染发', backend: 'public-hair-color', settings: hairColorSettings,
            worker: require.resolve('./worker.cjs') }, dependencies);
  }

  async repair(bytes, options) {
    const settings = hairColorSettings(options);
    if (settings.strengthPercent) return { ...await super.repair(bytes, settings), mode: 'chroma' };

    // 归零只读取转正后的尺寸，模型不可用时仍能清除颜色；关闭继续等待在途请求。
    if (this.closed) throw new Error('染发服务已关闭');
    if (this.active) throw new Error('染发正在处理，请稍候');
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 64 * 1024 * 1024) {
      throw new Error('照片内容无效');
    }
    const start = performance.now();
    let finish;
    this.active = new Promise(resolve => { finish = resolve; });
    try {
      const { autoOrient: { width, height } } = await sharp(bytes, {
        limitInputPixels: 80_000_000, failOn: 'error',
      }).metadata();
      return {
        png: Buffer.alloc(0), width, height, changedRGBFields: 0, processedRegions: 0, detectedRegions: 0,
        seconds: (performance.now() - start) / 1000, backend: this.workflow.backend,
        mode: 'chroma', nativeApplicationParity: false,
      };
    } finally {
      this.active = null;
      finish();
    }
  }
}

module.exports = { PublicHairColorService };
