'use strict';
const { PublicSkinEffectService } = require('../public-skin-effect-service.cjs');
const { resolveWrinkleStrengths } = require('../wrinkle-region-parameters.cjs');
const { wrinkleZones } = require('./geometry.cjs');
class PublicWrinkleService extends PublicSkinEffectService {
  constructor(dependencies) {
    super(
      {
        label: '祛皱',
        backend: 'public-directional-wrinkle-correction',
        protectNostrils: true,
        geometry: wrinkleZones,
        worker: require.resolve('./worker.cjs'),
        settings: (options) => resolveWrinkleStrengths(options).strengths,
      },
      dependencies,
    );
  }
  async repair(bytes, options = {}) {
    const { mode, strengths, enabled, regionsPercent } = resolveWrinkleStrengths(options);
    const result = await super.repair(
      bytes,
      mode === 'overall' ? { strength: strengths[0] } : { regionsPercent },
    );
    return {
      ...result,
      boxes: result.faces.map((f) => f.box),
      wrinkleMode: mode,
      rawStrengths: strengths,
      enabledSlots: enabled,
      regionsPercent,
      strength: mode === 'overall' ? strengths[0] : undefined,
      model: '公开定位与局部纹路校正',
    };
  }
}
module.exports = { PublicWrinkleService };
