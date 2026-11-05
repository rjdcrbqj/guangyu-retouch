'use strict';
const { PublicSkinEffectService } = require('../public-skin-effect-service.cjs');
function settings(options) {
  const values = { blemish: 0.4, acne: 0.8, freckle: 0.65, removeNevi: false, ...options.strengths };
  for (const key of ['blemish', 'acne', 'freckle'])
    if (!Number.isFinite(values[key]) || values[key] < 0 || values[key] > 1)
      throw Error('修复强度必须在 0 到 1 之间');
  if (typeof values.removeNevi !== 'boolean') throw Error('祛痣开关无效');
  return {
    blemish: values.blemish,
    acne: values.acne,
    freckle: values.freckle,
    removeNevi: values.removeNevi,
  };
}
class PublicPortraitRepairService extends PublicSkinEffectService {
  constructor(dependencies) {
    super(
      {
        label: '净肤',
        protectNostrils: true,
        backend: 'public-skin-spot-repair',
        worker: require.resolve('./worker.cjs'),
        settings,
      },
      dependencies,
    );
  }
  async repair(bytes, options = {}) {
    const strengths = settings(options),
      result = await super.repair(bytes, { strengths });
    return { ...result, boxes: result.faces.map((f) => f.box), strengths, model: '公开定位与局部净肤' };
  }
}
module.exports = { PublicPortraitRepairService };
