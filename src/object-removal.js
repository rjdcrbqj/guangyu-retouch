const patchImage = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const maxPatchPixels = 8_000_000;

function normalizePatch(value) {
  const { rect, image } = value ?? {};
  if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isSafeInteger)
      || rect.left < 0 || rect.top < 0 || rect.width < 1 || rect.height < 1
      || rect.left + rect.width > 32766 || rect.top + rect.height > 32766
      || rect.width * rect.height > maxPatchPixels
      || typeof image !== 'string' || image.length > 48 * 1024 * 1024 || !patchImage.test(image)) {
    throw new Error('工程中的修补片段无效。');
  }
  return { rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, image };
}

export function packRemovals(patches, assets) {
  return patches.map(({ rect, image }) => {
    let asset = assets.indexOf(image);
    if (asset === -1) asset = assets.push(image) - 1;
    return { rect, asset };
  });
}

export function unpackRemovals(value, assets) {
  if (!Array.isArray(value)) throw new Error('工程中的修补片段列表无效。');
  return value.map(item => {
    const index = item?.asset;
    if (!Number.isInteger(index) || index < 0 || index >= assets.length) throw new Error('工程中的修补片段缺失。');
    return normalizePatch({ rect: item.rect, image: assets[index] });
  });
}

export function sameRemovals(first, second) {
  return first === second || (first?.length ?? 0) === (second?.length ?? 0) && (!first?.length || first.every((patch, i) => {
    const other = second[i];
    return other?.image === patch.image && ['left', 'top', 'width', 'height'].every(key => patch.rect?.[key] === other.rect?.[key]);
  }));
}

export function normalizeRemovalResult(response, expected) {
  if (!response || !Number.isSafeInteger(response.changedPixels) || response.changedPixels < 0
      || response.changedPixels > expected.width * expected.height
      || !Object.keys(expected).every(key => response.rect?.[key] === expected[key])) {
    throw new Error('物体移除返回了无效的修补片段。');
  }
  if (response.changedPixels === 0 && response.png === null) return null;
  if (!response.changedPixels || typeof response.png !== 'string') throw new Error('物体移除未生成修补片段。');
  return normalizePatch({ rect: expected, image: 'data:image/png;base64,' + response.png });
}

// 通过实际画过的范围建立原像素请求，避免为大照片分配整幅蒙版。
export function removalSelection(canvas, width, height) {
  const { width: w, height: h } = canvas;
  const source = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let left = w, top = h, right = 0, bottom = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!source[(y * w + x) * 4 + 3]) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + 1);
    bottom = Math.max(bottom, y + 1);
  }
  if (!right) return null;
  const scaleX = width / w, scaleY = height / h;
  const startX = Math.max(0, Math.floor((left - .5) * scaleX));
  const startY = Math.max(0, Math.floor((top - .5) * scaleY));
  const rect = { left: startX, top: startY,
    width: Math.min(width, Math.ceil((right + .5) * scaleX)) - startX,
    height: Math.min(height, Math.ceil((bottom + .5) * scaleY)) - startY };
  if (rect.width * rect.height > maxPatchPixels) throw new Error('选区超过 800 万像素，请分次移除。');
  const mask = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const sy = Math.min(h - 1, Math.max(0, (startY + y + .5) / scaleY - .5));
    const y0 = Math.floor(sy), fy = sy - y0, y1 = Math.min(y0 + 1, h - 1);
    for (let x = 0; x < rect.width; x++) {
      const sx = Math.min(w - 1, Math.max(0, (startX + x + .5) / scaleX - .5));
      const x0 = Math.floor(sx), fx = sx - x0, x1 = Math.min(x0 + 1, w - 1);
      const upper = source[(y0 * w + x0) * 4 + 3] * (1 - fx) + source[(y0 * w + x1) * 4 + 3] * fx;
      const lower = source[(y1 * w + x0) * 4 + 3] * (1 - fx) + source[(y1 * w + x1) * 4 + 3] * fx;
      mask[y * rect.width + x] = Math.round(upper * (1 - fy) + lower * fy);
    }
  }
  return { rect, mask };
}
