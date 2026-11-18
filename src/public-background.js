export const MAX_BACKGROUND_BYTES = 60 * 1024 * 1024;
const embeddedImage = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

// 背景只接受本地导入后内嵌的图像，位置相对于铺满画面后可移动的范围。
export function normalizeBackground(value) {
  if (value == null) return null;
  if (value.kind === 'color' && typeof value.color === 'string' && /^#[a-f0-9]{6}$/i.test(value.color)) {
    return { kind: 'color', color: value.color.toLowerCase() };
  }
  if (value.kind === 'image') {
    const { image, name = '背景照片', zoom = 1, x = 0, y = 0 } = value;
    if (typeof image === 'string' && image.length <= Math.ceil(MAX_BACKGROUND_BYTES / 3) * 4 + 32 &&
        embeddedImage.test(image) && typeof name === 'string' && name.length <= 256 &&
        [zoom, x, y].every(Number.isFinite) && zoom >= 1 && zoom <= 3 && Math.abs(x) <= 1 && Math.abs(y) <= 1) {
      return { kind: 'image', image, name, zoom, x, y };
    }
  }
  throw new Error('背景替换数据无效。');
}

// 将等比覆盖窗口转成 GPU 左下角坐标，滑到边缘时画面始终被覆盖。
export function backgroundWindow(imageWidth, imageHeight, frameWidth, frameHeight, { zoom = 1, x = 0, y = 0 } = {}) {
  if (![imageWidth, imageHeight, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('背景图或输出尺寸无效。');
  }
  const ratio = (frameWidth / frameHeight) / (imageWidth / imageHeight);
  const width = Math.min(1, ratio) / zoom;
  const height = Math.min(1, 1 / ratio) / zoom;
  return [width, height, (1 - width) * (x + 1) / 2, (1 - height) * (1 - y) / 2];
}

// 只上传最大取景倍数会用到的图像分辨率，并保留设备可读取的边长。
export function backgroundTextureScale(imageWidth,imageHeight,frameWidth,frameHeight,limit) {
  const coverScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  return Math.min(1,3 * coverScale,limit / Math.max(imageWidth,imageHeight));
}

// 工程中同一背景图只存一次，取景历史存索引和参数。
export function packBackground(value, assets) {
  if (value?.kind !== 'image') return value;
  const { image, ...settings } = value;
  let asset = assets.indexOf(image);
  if (asset === -1) asset = assets.push(image) - 1;
  return { ...settings, asset };
}

export function unpackBackground(value, assets) {
  if (value?.kind !== 'image') return normalizeBackground(value);
  const { asset, ...settings } = value;
  if (!Number.isInteger(asset) || asset < 0 || asset >= assets.length) throw new Error('工程中的背景照片缺失。');
  return normalizeBackground({ ...settings, image: assets[asset] });
}

export const backgroundGLSL = `
uniform int backgroundMode;
uniform vec3 backgroundColor;
uniform vec4 backgroundCrop;
uniform sampler2D backgroundTex;
vec4 compositeBackground(vec4 subject, vec2 uv) {
  if (backgroundMode == 0) return subject;
  vec4 background = backgroundMode == 1
    ? vec4(backgroundColor, 1.0)
    : texture2D(backgroundTex, uv * backgroundCrop.xy + backgroundCrop.zw);
  float remaining = 1.0 - subject.a;
  float alpha = subject.a + background.a * remaining;
  vec3 rgb = subject.rgb * subject.a + background.rgb * remaining;
  return vec4(alpha > 0.0 ? rgb / alpha : vec3(0.0), alpha);
}
`;
