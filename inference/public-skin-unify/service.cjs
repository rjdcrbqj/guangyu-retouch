'use strict';
const { PublicSkinEffectService } = require('../public-skin-effect-service.cjs');
function strengthFromPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 100)
    throw Error('请把肤色统一强度设置为1至100');
  return Math.fround(value / 100);
}
class PublicSkinUnifyService extends PublicSkinEffectService {
  constructor(dependencies) {
    super(
      {
        label: '肤色统一',
        backend: 'public-skin-tone-unify',
        worker: require.resolve('./worker.cjs'),
        settings: (options) => strengthFromPercent(options.strengthPercent),
      },
      dependencies,
    );
  }
}
module.exports = { PublicSkinUnifyService, strengthFromPercent };
