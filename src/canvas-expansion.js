const maxDimension = 32766;
const maxPixels = 80_000_000;
const maxTransferChunk = 1024 * 1024;
const minPngHeaderBytes = 24;
const pngPrefix = 'data:image/png;base64,';
const pngHeader = '\x89PNG\r\n\x1a\n\0\0\0\rIHDR';
const rectKeys = ['left', 'top', 'width', 'height'];

function validSize(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) &&
    width > 0 && height > 0 && width <= maxDimension && height <= maxDimension && width * height <= maxPixels;
}

function sameRect(left, right) {
  return Boolean(left && right && rectKeys.every(key => left[key] === right[key]));
}

// 四个边带互不重叠。上、下各占全宽，左右只覆盖原图高度。
export function expansionLayout(coreWidth, coreHeight, margins) {
  if (!validSize(coreWidth, coreHeight)) throw new Error('原照片尺寸超出限制。');
  const { left = 0, top = 0, right = 0, bottom = 0 } = margins ?? {};
  if (![left, top, right, bottom].every(value => Number.isSafeInteger(value) && value >= 0) ||
      !(left || top || right || bottom)) throw new Error('扩展边距必须是非负整数，且至少扩展一侧。');

  const width = left + coreWidth + right, height = top + coreHeight + bottom;
  if (!validSize(width, height)) throw new Error('扩展后的画布尺寸超出限制。');
  const bands = [];
  if (top) bands.push({ left: 0, top: 0, width, height: top });
  if (left) bands.push({ left: 0, top, width: left, height: coreHeight });
  if (right) bands.push({ left: left + coreWidth, top, width: right, height: coreHeight });
  if (bottom) bands.push({ left: 0, top: top + coreHeight, width, height: bottom });
  return { width, height, core: { left, top, width: coreWidth, height: coreHeight }, bands };
}

function validatedLayout(value) {
  const { width, height, core, bands } = value;
  if (!validSize(width, height) || !core) throw new Error('扩展后的画布尺寸无效。');
  const layout = expansionLayout(core.width, core.height, {
    left: core.left, top: core.top, right: width - core.left - core.width, bottom: height - core.top - core.height,
  });
  if (width !== layout.width || height !== layout.height || !sameRect(core, layout.core) ||
      !Array.isArray(bands) || bands.length !== layout.bands.length ||
      !layout.bands.every((item, i) => sameRect(item, bands[i]))) {
    throw new Error('画布扩展边带无效。');
  }
  return layout;
}

function readUint32(header, offset) {
  return header.charCodeAt(offset) * 0x1000000 + header.charCodeAt(offset + 1) * 0x10000 +
    header.charCodeAt(offset + 2) * 0x100 + header.charCodeAt(offset + 3);
}

// RGBA 的未压缩像素、每行过滤字节、压缩块与 PNG 文件头的空间上限。
function maxPngBytes({ width, height }) {
  return Math.ceil((width * 4 + 1) * height * 1.02) + 128 * 1024;
}

function validateImage(image, rect) {
  const invalid = () => new Error('工程中的扩展边带图像无效。');
  const { width, height } = rect;
  const maxBytes = maxPngBytes(rect);
  if (typeof image !== 'string' || !image.startsWith(pngPrefix) ||
      image.length > pngPrefix.length + Math.ceil(maxBytes / 3) * 4) throw invalid();
  const payload = image.slice(pngPrefix.length);
  if (payload.length < 32 || payload.length % 4 || !/^[A-Za-z0-9+/]+={0,2}(?![\s\S])/.test(payload)) throw invalid();
  const header = atob(payload.slice(0, 32));
  if (!header.startsWith(pngHeader) || readUint32(header, 16) !== width || readUint32(header, 20) !== height) throw invalid();
  return image;
}

export async function transferExpansion(rendered, value, margins, desktop, encodePng) {
  const layout = validatedLayout(value);
  const { width, height } = layout.core;
  if (!(rendered instanceof Blob) || rendered.type !== 'image/png' ||
      rendered.size < minPngHeaderBytes || rendered.size > maxPngBytes(layout.core)) {
    throw new Error('当前画布的 PNG 大小无效。');
  }
  const { id, chunkSize } = await desktop.beginExpansionTransfer({ size: rendered.size, width, height, margins }) ?? {};
  try {
    if (typeof id !== 'string' || !id || !Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > maxTransferChunk) {
      throw new Error('无法开始扩画布传输。');
    }
    // 当前画布原样分块传输，避免把整张照片先转换成 Base64。
    for (let offset = 0; offset < rendered.size; offset += chunkSize) {
      const bytes = new Uint8Array(await rendered.slice(offset, offset + chunkSize).arrayBuffer());
      await desktop.appendExpansionChunk({ id, offset, bytes });
    }
    const result = await desktop.finishExpansionTransfer({ id });
    const actual = validatedLayout(result ?? {});
    if (actual.width !== layout.width || actual.height !== layout.height || !sameRect(actual.core, layout.core) ||
        result.generatedPixels !== layout.width * layout.height - width * height) {
      throw new Error('扩画布返回的尺寸不一致。');
    }
    const sizes = result.bands.map(({ size }, i) => {
      if (!Number.isSafeInteger(size) || size < minPngHeaderBytes || size > maxPngBytes(layout.bands[i])) {
        throw new Error('扩展边带的 PNG 大小无效。');
      }
      return size;
    });
    const bands = [];
    for (const [band, rect] of layout.bands.entries()) {
      const chunks = [];
      for (let offset = 0; offset < sizes[band];) {
        const bytes = await desktop.readExpansionChunk({ id, band, offset });
        if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > Math.min(chunkSize, sizes[band] - offset)) {
          throw new Error('扩展边带的分块数据不完整。');
        }
        chunks.push(bytes);
        offset += bytes.byteLength;
      }
      const png = new Blob(chunks, { type: 'image/png' });
      bands.push({ ...rect, image: validateImage(await encodePng(png), rect) });
    }
    return { ...layout, bands };
  } finally {
    if (typeof id === 'string' && id) await desktop.endExpansionTransfer({ id }).catch(() => {});
  }
}

function readExpansion(value, readImage) {
  if (value == null) return null;
  const layout = validatedLayout(value);
  return {
    ...layout,
    bands: layout.bands.map((rect, i) => ({ ...rect, image: validateImage(readImage(value.bands[i]), rect) })),
  };
}

export function normalizeExpansion(value) {
  return readExpansion(value, band => band.image);
}

export function cloneExpansion(value) {
  return value == null ? null : { ...value, core: { ...value.core }, bands: value.bands.map(band => ({ ...band })) };
}

export function sameExpansion(left, right) {
  if (left === right || left == null && right == null) return true;
  return Boolean(left && right && left.width === right.width && left.height === right.height &&
    sameRect(left.core, right.core) && left.bands.length === right.bands.length && left.bands.every((band, i) => {
      const other = right.bands[i];
      return sameRect(band, other) && band.image === other.image && band.asset === other.asset;
    }));
}

export function packExpansion(value, assets) {
  const expansion = normalizeExpansion(value);
  if (!expansion) return null;
  return {
    ...expansion,
    bands: expansion.bands.map(({ image, ...rect }) => {
      let asset = assets.indexOf(image);
      if (asset === -1) asset = assets.push(image) - 1;
      return { ...rect, asset };
    }),
  };
}

export function unpackExpansion(value, assets) {
  return readExpansion(value, ({ asset }) => {
    if (!Number.isInteger(asset) || asset < 0 || asset >= assets.length) throw new Error('工程中的扩展边带资源缺失。');
    return assets[asset];
  });
}

function imageMatches(image, { width, height }) {
  return (image?.naturalWidth ?? image?.width) === width && (image?.naturalHeight ?? image?.height) === height;
}

function prepareCanvas(canvas, { width, height }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width !== width || canvas.height !== height) throw new Error('无法创建指定尺寸的扩展画布。');
  return ctx;
}

export function extractExpansion(image, value) {
  const layout = validatedLayout(value);
  if (!imageMatches(image, layout)) throw new Error('扩展返回的图像尺寸不匹配。');
  const canvas = document.createElement('canvas');
  try {
    const bands = layout.bands.map(rect => {
      const { left, top, width, height } = rect;
      const ctx = prepareCanvas(canvas, rect);
      ctx.drawImage(image, left, top, width, height, 0, 0, width, height);
      const cropped = validateImage(canvas.toDataURL('image/png'), rect);
      return { ...rect, image: cropped };
    });
    return { ...layout, bands };
  } finally {
    canvas.width = 0;
  }
}

export async function loadExpansion(value, loadImage) {
  const expansion = normalizeExpansion(value);
  if (!expansion) return [];
  return Promise.all(expansion.bands.map(async band => {
    const image = await loadImage(band.image);
    if (!imageMatches(image, band)) throw new Error('扩展边带图像尺寸不匹配。');
    return image;
  }));
}

export function composeExpansion(coreCanvas, expansion, images) {
  if (expansion == null) return coreCanvas;
  const layout = validatedLayout(expansion);
  if (!imageMatches(coreCanvas, layout.core) || !Array.isArray(images) || images.length !== layout.bands.length ||
      !layout.bands.every((band, i) => imageMatches(images[i], band))) throw new Error('扩展画布图像尺寸不匹配。');
  const canvas = document.createElement('canvas');
  const ctx = prepareCanvas(canvas, layout);
  for (const [i, band] of layout.bands.entries()) ctx.drawImage(images[i], band.left, band.top);
  ctx.drawImage(coreCanvas, layout.core.left, layout.core.top);
  return canvas;
}
