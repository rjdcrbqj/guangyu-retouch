'use strict';

const sharp = require('sharp');
const { openPublicPhoto } = require('../public-photo.cjs');
const PNG_PREFIX = 'data:image/png;base64,';

function validateRect(rect, width, height) {
  if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isSafeInteger)
      || rect.left < 0 || rect.top < 0 || rect.width < 1 || rect.height < 1
      || rect.left + rect.width > width || rect.top + rect.height > height || rect.width * rect.height > 8_000_000) {
    throw new RangeError('修补片段尺寸无效');
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

async function orientedPhoto(bytes, width, height) {
  const photo = openPublicPhoto(bytes);
  const metadata = await photo.metadata();
  const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
  if (width !== (rotated ? metadata.height : metadata.width) || height !== (rotated ? metadata.width : metadata.height)) {
    throw new RangeError('照片显示尺寸与修补选区不一致');
  }
  return photo.rotate();
}

async function patchPixels(rect, image) {
  if (typeof image !== 'string' || image.length > 48 * 1024 * 1024 || !image.startsWith(PNG_PREFIX)
      || !/^[A-Za-z0-9+/]+=*$/.test(image.slice(PNG_PREFIX.length))) throw new Error('修补片段编码无效');
  const patch = sharp(Buffer.from(image.slice(PNG_PREFIX.length), 'base64'), { limitInputPixels: 8_000_000 });
  const meta = await patch.metadata();
  if (meta.format !== 'png' || meta.width !== rect.width || meta.height !== rect.height) throw new Error('修补图和选区的尺寸不一致');
  return patch.toColourspace('srgb').ensureAlpha().raw().toBuffer();
}

async function applyPatches(data, context, patches, width, height) {
  if (!Array.isArray(patches)) throw new Error('修补片段列表无效');
  for (const patch of patches) {
    const rect = validateRect(patch?.rect, width, height);
    const left = Math.max(context.left, rect.left), top = Math.max(context.top, rect.top);
    const right = Math.min(context.left + context.width, rect.left + rect.width);
    const bottom = Math.min(context.top + context.height, rect.top + rect.height);
    if (left >= right || top >= bottom) continue;
    const pixels = await patchPixels(rect, patch.image);
    // 图块是原像素替换。逐行拷贝避免半透明像素在反复合成时越叠越不透明。
    for (let y = top; y < bottom; y++) {
      const from = ((y - rect.top) * rect.width + left - rect.left) * 4;
      const to = ((y - context.top) * context.width + left - context.left) * 4;
      const count = (right - left) * 4;
      for (let offset = 3; offset < count; offset += 4) {
        if (data[to + offset] !== pixels[from + offset]) throw new Error('修补片段的透明度与原图不一致');
      }
      pixels.copy(data, to, from, from + count);
    }
  }
  return data;
}

async function composeRemovalPhoto(original, { width, height, patches }) {
  const photo = await orientedPhoto(original, width, height);
  const data = await photo.toColourspace('srgb').ensureAlpha().raw().toBuffer();
  await applyPatches(data, { left: 0, top: 0, width, height }, patches, width, height);
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

module.exports = { orientedPhoto, applyPatches, composeRemovalPhoto };
