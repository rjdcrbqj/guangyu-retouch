import { normalizeBackground, unpackBackground } from './public-background.js';

export function normalizeSky({ image, name, zoom, x, y, strength = 1 }) {
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error('天空替换强度无效。');
  return { ...normalizeBackground({ kind: 'image', image, name, zoom, x, y }), strength };
}

export function unpackSky(value, assets) {
  if (value?.kind !== 'image') throw new Error('工程中的天空照片无效。');
  return normalizeSky({ ...unpackBackground(value, assets), strength: value.strength });
}

export const skyGLSL = `
uniform sampler2D skyTex;
uniform vec4 skyCrop;
uniform float skyStrength;
vec3 replaceSky(vec3 rgb, vec2 uv, float matte) {
  if (skyStrength <= 0.0 || matte <= 0.0) return rgb;
  vec4 sky = texture2D(skyTex, uv * skyCrop.xy + skyCrop.zw);
  float selected = matte * skyStrength;
  return rgb * (1.0 - selected * sky.a) + sky.rgb * selected;
}`;
