const MAX_STROKES = 256;
const MAX_POINTS = 2048;

function isPoint(value) {
  return Array.isArray(value) && value.length === 2 &&
    [...value].every(coordinate => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1);
}

function isRadius(value) {
  return Number.isFinite(value) && value >= .005 && value <= .5;
}

export function normalizeLiquify(strokes) {
  if (strokes == null) return [];
  if (!Array.isArray(strokes) || strokes.length > MAX_STROKES) {
    throw new RangeError('液化笔划数量无效。');
  }
  let total = 0;
  const result = [];
  for (const stroke of strokes) {
    if (!stroke || !isRadius(stroke.radius) || !Array.isArray(stroke.points) || stroke.points.length < 2) {
      throw new RangeError('液化笔划或笔刷半径无效。');
    }
    total += stroke.points.length;
    if (total > MAX_POINTS || ![...stroke.points].every(isPoint)) {
      throw new RangeError('液化笔划点位无效或过多。');
    }
    const points = stroke.points.filter((point, i) =>
      i === 0 || point[0] !== stroke.points[i - 1][0] || point[1] !== stroke.points[i - 1][1]);
    if (points.length > 1) result.push({ radius: stroke.radius, points: points.map(point => [...point]) });
  }
  return result;
}

// 用源像素计算距离，保证横图、竖图及不同缩放倍率下笔刷均为圆形。
export function splitLiquifySegment(start, end, radius, width, height) {
  if (!isPoint(start) || !isPoint(end) || !isRadius(radius) ||
      ![width, height].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('液化坐标或照片尺寸无效。');
  }
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const distance = Math.hypot(dx * width, dy * height);
  const step = radius * Math.min(width, height) / 4;
  const count = Math.ceil(distance / step);
  if (count > MAX_POINTS) throw new RangeError('液化移动距离过长，请分段拖动。');
  return Array.from({ length: count }, (_, i) => {
    if (i === count - 1) return [...end];
    const t = (i + 1) / count;
    return [start[0] + t * dx, start[1] + t * dy];
  });
}

export function compileLiquify(strokes, width, height) {
  const steps = [];
  for (const { radius, points } of normalizeLiquify(strokes)) {
    for (let i = 1; i < points.length; i++) {
      let from = points[i - 1];
      const path = splitLiquifySegment(from, points[i], radius, width, height);
      if (steps.length + path.length > MAX_POINTS) throw new RangeError('液化笔划过多。');
      for (const to of path) {
        steps.push({ from, to, radius: radius * Math.min(width, height) });
        from = to;
      }
    }
  }
  return steps;
}

function stepWeight(x, y, to, radius, width, height) {
  const distance = Math.hypot((x - to[0]) * width, (y - to[1]) * height);
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  const border = Math.min(x * width, (1 - x) * width, y * height, (1 - y) * height);
  return t * t * (3 - 2 * t) * Math.min(1, border / radius);
}

// 逆向重放笔划，读取应该移动到该输出点的源位置。
export function sampleLiquify(strokes, point, width, height) {
  let [x, y] = point;
  const steps = compileLiquify(strokes, width, height);
  for (let i = steps.length - 1; i >= 0; i--) {
    const { from, to, radius } = steps[i];
    const weight = stepWeight(x, y, to, radius, width, height);
    x -= (to[0] - from[0]) * weight;
    y -= (to[1] - from[1]) * weight;
  }
  return [x, y];
}

// 在规则网格上合成位移。先计算整个笔刷邻域，再写回，避免读到同一步的结果。
export function rasterLiquify(strokes, width, height, columns, rows, storage) {
  const dimensionLimit = storage ? 1048576 : 2048;
  if (![columns, rows].every(v => Number.isSafeInteger(v) && v >= 2 && v <= dimensionLimit) ||
      (!storage && columns * rows > 1024 * 1024)) {
    throw new RangeError('液化网格尺寸无效。');
  }
  const steps = compileLiquify(strokes, width, height);
  const displacement = storage ? null : new Float32Array(columns * rows * 2);
  const read = storage ? storage.read : (x, y, c) => displacement[(y * columns + x) * 2 + c];
  const write = storage ? storage.write : (x, y, dx, dy) => {
    const i = (y * columns + x) * 2;
    displacement[i] = dx; displacement[i + 1] = dy;
  };
  const maxX = columns - 1, maxY = rows - 1;
  let work = 0;
  for (const { from, to, radius } of steps) {
    const left = Math.max(1, Math.floor((to[0] - radius / width) * maxX));
    const right = Math.min(maxX - 1, Math.ceil((to[0] + radius / width) * maxX));
    const top = Math.max(1, Math.floor((to[1] - radius / height) * maxY));
    const bottom = Math.min(maxY - 1, Math.ceil((to[1] + radius / height) * maxY));
    if (left > right || top > bottom) continue;
    work += (right - left + 1) * (bottom - top + 1);
    if (work > 80_000_000) throw new RangeError('当前照片的液化笔划过多。');
    const stride = right - left + 1;
    const pending = new Float32Array(stride * (bottom - top + 1) * 2);
    for (let j = top; j <= bottom; j++) {
      const y = j / maxY;
      for (let i = left; i <= right; i++) {
        const x = i / maxX;
        const weight = stepWeight(x, y, to, radius, width, height);
        const u = x - (to[0] - from[0]) * weight;
        const v = y - (to[1] - from[1]) * weight;
        const sx = u * maxX, sy = v * maxY;
        const ix = Math.min(maxX - 1, Math.floor(sx)), iy = Math.min(maxY - 1, Math.floor(sy));
        const tx = sx - ix, ty = sy - iy;
        const out = ((j - top) * stride + i - left) * 2;
        for (let c = 0; c < 2; c++) {
          const start = read(ix, iy, c) * (1 - tx) + read(ix + 1, iy, c) * tx;
          const end = read(ix, iy + 1, c) * (1 - tx) + read(ix + 1, iy + 1, c) * tx;
          pending[out + c] = start * (1 - ty) + end * ty + (c === 0 ? u - x : v - y);
        }
      }
    }
    for (let j = top; j <= bottom; j++) {
      for (let i = left; i <= right; i++) {
        const index = ((j - top) * stride + i - left) * 2;
        write(i, j, pending[index], pending[index + 1]);
      }
    }
  }
  return displacement;
}

export const LIQUIFY_TILE = 64;

// 只存放有位移的网格块，避免极长照片的小笔刷落在相邻格点之间。
export function packLiquify(strokes, width, height, limit) {
  const side = LIQUIFY_TILE;
  const normalized = normalizeLiquify(strokes);
  // 至少用八格描述最小笔刷半径；大笔刷无需重新生成同样密集的场。
  const resolution = normalized.reduce((value, stroke) => Math.max(value, Math.ceil(8 / stroke.radius)), 256);
  const step = Math.min(width, height) / resolution;
  const columns = 1 + Math.ceil(width / step), rows = 1 + Math.ceil(height / step);
  const gridWidth = Math.ceil(columns / side), gridHeight = Math.ceil(rows / side);
  const atlasColumns = Math.floor(Math.min(limit, 2048) / side);
  const maxTiles = Math.min(1024, atlasColumns ** 2);
  if (!maxTiles || gridWidth > limit || gridHeight > limit || gridWidth * gridHeight > 1048576) {
    throw RangeError('照片比例超过设备的液化网格容量。');
  }
  const tiles = new Map();
  const locate = (x, y) => Math.floor(y / side) * gridWidth + Math.floor(x / side);
  const offset = (x, y) => ((y % side) * side + x % side) * 2;
  const read = (x, y, c) => tiles.get(locate(x, y))?.[offset(x, y) + c] ?? 0;
  const write = (x, y, dx, dy) => {
    const key = locate(x, y);
    let tile = tiles.get(key);
    if (!tile) {
      if (!dx && !dy) return;
      if (tiles.size >= maxTiles) throw RangeError('照片的液化区域超过设备容量。');
      tile = new Float32Array(side * side * 2);tiles.set(key, tile);
    }
    const index = offset(x, y);
    tile[index] = dx;tile[index + 1] = dy;
  };
  rasterLiquify(normalized, width, height, columns, rows, { read, write });
  const indexMap = new Uint8Array(gridWidth * gridHeight * 4);
  const packedWidth = Math.min(atlasColumns, Math.max(1, tiles.size)) * side;
  const packedHeight = Math.max(1, Math.ceil(tiles.size / atlasColumns)) * side;
  const bytes = new Uint8Array(packedWidth * packedHeight * 4);
  const scale = [1 / (32 * width), 1 / (32 * height)];
  for (const tile of tiles.values()) for (let i = 0; i < tile.length; i++) {
    scale[i % 2] = Math.max(scale[i % 2], Math.abs(tile[i]) / 32767);
  }
  let id = 0;
  for (const [key, tile] of tiles) {
    const col = id % atlasColumns, row = Math.floor(id / atlasColumns);
    indexMap.set([col, row, 1, 255], key * 4);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const source = (y * side + x) * 2;
      const dest = ((row * side + y) * packedWidth + col * side + x) * 4;
      for (let c = 0; c < 2; c++) {
        const word = 32768 + Math.round(tile[source+c] / scale[c]);
        bytes[dest + c * 2] = word >>> 8;
        bytes[dest + c * 2 + 1] = word & 255;
      }
    }
    id++;
  }
  return { columns, rows, gridWidth, gridHeight, indexMap, packedWidth, packedHeight, bytes, scale };
}
