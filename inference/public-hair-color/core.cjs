'use strict';

const { confidence } = require('../public-skin-confidence.cjs');
const { validateHairFrame } = require('../public-hair-smooth/core.cjs');

const clamp = value => Math.max(0, Math.min(1, value));
const linear = Float64Array.from({ length: 256 }, (_, byte) => {
  const value = byte / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
});
const light = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;

function encode(value) {
  const color = clamp(value);
  return Math.round(255 * (color <= .0031308 ? color * 12.92 : 1.055 * color ** (1 / 2.4) - .055));
}

function smooth(from, to, value) {
  const fraction = clamp((value - from) / (to - from));
  return fraction * fraction * (3 - 2 * fraction);
}

function hairColorSettings(options) {
  const { strengthPercent, colorRGB } = options ?? {};
  if (typeof options !== 'object' || Array.isArray(options) ||
      !Number.isFinite(strengthPercent) || strengthPercent < 0 || strengthPercent > 100 ||
      !Number.isInteger(colorRGB) || colorRGB < 0 || colorRGB > 0xffffff) {
    throw new Error('染发颜色或强度无效。');
  }
  return { strengthPercent, colorRGB };
}

function editHairColor(frame, options) {
  validateHairFrame(frame);
  const { strengthPercent, colorRGB } = hairColorSettings(options);
  const { data, width, height, mask } = frame;
  if (!strengthPercent) return { output: data, changedRGBFields: 0 };

  const targetR = linear[colorRGB >> 16];
  const targetG = linear[(colorRGB >> 8) & 255];
  const targetB = linear[colorRGB & 255];
  const targetY = light(targetR, targetG, targetB);
  const tintR = targetR - targetY, tintG = targetG - targetY, tintB = targetB - targetY;
  const strength = strengthPercent / 100;
  const fullySelected = mask.every(value => value >= 240);
  let output = data, changedRGBFields = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      if (!alpha) continue;
      // 只从工作蒙版插值置信度，保持弱发际不染色；不会读取邻居的 RGB。
      const coverage = fullySelected ? 1 : smooth(.5, 1, confidence(frame, width, height, x, y));
      if (!coverage) continue;
      const r = linear[data[i]], g = linear[data[i + 1]], b = linear[data[i + 2]];
      const luminance = light(r, g, b);
      // 深阴影与高光的保护连续衰减。发丝原亮度不被替换，半透明处进一步减轻色度。
      const protection = smooth(.006, .035, luminance) * (1 - smooth(.38, .68, luminance));
      const amount = strength * coverage * protection * (alpha / 255);
      if (!amount) continue;

      // 去除样本色的亮度，只添色度；缩放到该像素的可用色域，避免通道裁剪损坏亮度。
      const scale = Math.min(1, luminance / (targetY || 1), (1 - luminance) / ((1 - targetY) || 1));
      const red = encode(r + (luminance + tintR * scale - r) * amount);
      const green = encode(g + (luminance + tintG * scale - g) * amount);
      const blue = encode(b + (luminance + tintB * scale - b) * amount);
      if (red === data[i] && green === data[i + 1] && blue === data[i + 2]) continue;
      if (output === data) output = new Uint8Array(data);
      output[i] = red;
      output[i + 1] = green;
      output[i + 2] = blue;
      changedRGBFields += Number(red !== data[i]) + Number(green !== data[i + 1]) + Number(blue !== data[i + 2]);
    }
  }
  return { output, changedRGBFields };
}

module.exports = { editHairColor, hairColorSettings };
