export const EYE_SIZE_AXIS_GAIN = Object.freeze([.14, .19]);
export const EYE_SIZE_MAX_STRENGTH = EYE_SIZE_AXIS_GAIN[1];
export const MAX_EYE_SIZE_EYES = 16;

const maxDimension = 32766;
const maxPixels = 80_000_000;
const unitTolerance = 1e-5;

function finitePair(pair) {
  return Array.isArray(pair) && pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]);
}

function sourceSize(pair) {
  return finitePair(pair) && pair.every(value => Number.isSafeInteger(value) && value > 0 && value <= maxDimension) &&
    pair[0] * pair[1] <= maxPixels;
}

function projectRadius({ axis: [a, b], radii: [rx, ry] }, [x, y]) {
  return Math.hypot(rx * (x * a + y * b), ry * (-x * b + y * a));
}

function safelySeparated(first, second) {
  const dx = second.center[0] - first.center[0];
  const dy = second.center[1] - first.center[1];
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return false;
  const normals = [[dx / distance, dy / distance]];
  for (const { axis: [x, y] } of [first, second]) normals.push([x, y], [-y, x]);
  // 有分离轴才能确定两支撑椭圆不接触。找不到分离证据时保守拒绝。
  return normals.some(normal => Math.abs(dx * normal[0] + dy * normal[1]) >
    projectRadius(first, normal) + projectRadius(second, normal) + 1e-8);
}

function checkedEye(value, [width, height]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !finitePair(value.center) || !finitePair(value.axis) || !finitePair(value.radii) ||
      value.radii.some(radius => radius < 1 || radius > maxDimension)) {
    throw new Error('大眼几何无效。');
  }
  const length = Math.hypot(...value.axis);
  const error = Math.abs(length - 1);
  if (error > unitTolerance) throw new Error('大眼方向必须是单位向量。');
  // 把测量误差归一化一次，反复读取工程时保留已达浮点精度的坐标。
  const axis = error <= 4 * Number.EPSILON ? [...value.axis] : value.axis.map(component => component / length);
  const eye = { center: [...value.center], axis, radii: [...value.radii] };
  const [x, y] = eye.center;
  const dx = projectRadius(eye, [1, 0]);
  const dy = projectRadius(eye, [0, 1]);
  if (x - dx <= 0 || x + dx >= width || y - dy <= 0 || y + dy >= height) {
    throw new Error('大眼支撑区触及照片边界。');
  }
  return eye;
}

// 校验工程中的小型几何状态，可选地绑定已解码照片的实际尺寸。
export function normalizeEyeSize(value, { sourceWH } = {}) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) ||
      !Number.isInteger(value.strength) || value.strength < 0 || value.strength > 100) {
    throw new Error('大眼强度无效。');
  }
  if (value.strength === 0) return null;
  if (!sourceSize(value.sourceWH) || (sourceWH !== undefined &&
      (!sourceSize(sourceWH) || sourceWH.some((size, i) => value.sourceWH[i] !== size)))) {
    throw new Error('大眼照片尺寸无效或不匹配。');
  }
  if (!Array.isArray(value.faces) || value.faces.length > MAX_EYE_SIZE_EYES / 2) {
    throw new Error('大眼人物数据无效。');
  }
  if (value.faces.length === 0) return null;
  const eyes = [];
  const faces = [];
  for (const pair of value.faces) {
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error('每个人物必须提供一对眼睛。');
    const face = [checkedEye(pair[0], value.sourceWH), checkedEye(pair[1], value.sourceWH)];
    for (const eye of face) {
      if (eyes.some(other => !safelySeparated(eye, other))) throw new Error('大眼支撑区不能重合或接触。');
      eyes.push(eye);
    }
    faces.push(face);
  }
  return { strength: value.strength, sourceWH: [...value.sourceWH], faces };
}

// 查询输出位置对应的源图坐标。输入为已校验状态和左上原点的归一化坐标。
export function sampleEyeSize(state, point) {
  if (!finitePair(point) || point.some(value => value < 0 || value > 1)) throw new Error('大眼采样位置无效。');
  if (!state?.strength || !state.faces?.length) return point;
  const [u, v] = point;
  const [width, height] = state.sourceWH;
  const strength = state.strength / 100;
  for (const face of state.faces) {
    for (const { center: [cx, cy], axis: [a, b], radii: [rx, ry] } of face) {
      const dx = u * width - cx;
      const dy = v * height - cy;
      const along = dx * a + dy * b;
      const across = -dx * b + dy * a;
      const falloff = 1 - (along / rx) ** 2 - (across / ry) ** 2;
      if (falloff <= 0) continue;
      const weight = strength * falloff ** 2;
      const alongShift = EYE_SIZE_AXIS_GAIN[0] * along;
      const acrossShift = EYE_SIZE_AXIS_GAIN[1] * across;
      return [u - weight * (alongShift * a - acrossShift * b) / width,
              v - weight * (alongShift * b + acrossShift * a) / height];
    }
  }
  return point;
}
