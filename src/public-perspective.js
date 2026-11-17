export const IDENTITY_CORNERS = Object.freeze([
  [0, 0], [1, 0], [1, 1], [0, 1],
].map(Object.freeze));

// 顶点顺序为左上、右上、右下、左下，坐标原点在左上。
export function perspectiveMatrix(corners) {
  if (!Array.isArray(corners) || corners.length !== 4 ||
      [...corners].some(point => !Array.isArray(point) || point.length !== 2 ||
        [...point].some(value => !Number.isFinite(value) || value < 0 || value > 1))) {
    throw new RangeError('透视校正需要四个有效的照片坐标。');
  }

  // 近共线或内凹的四边形无法稳定映射到原尺寸网格。
  for (let index = 0; index < 4; index++) {
    const [ax, ay] = corners[index];
    const [bx, by] = corners[(index + 1) % 4];
    const [cx, cy] = corners[(index + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (cross < 1e-5) throw new RangeError('透视校正的四角不能交叉或重合。');
  }

  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const closureX = x0 - x1 + x2 - x3;
  const closureY = y0 - y1 + y2 - y3;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = (closureX * dy2 - dx2 * closureY) / determinant || 0;
  const h = (dx1 * closureY - closureX * dy1) / determinant || 0;

  // 分母在矩形内为线性函数，检查四角即可排除内部极点。
  const weights = [1, 1 + g, 1 + g + h, 1 + h];
  if (Math.min(...weights) <= Math.max(...weights) * 1e-5) {
    throw new RangeError('透视校正的形变过大。');
  }
  return [
    x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
    g, h, 1,
  ];
}

export function mapPerspective(matrix, [x, y]) {
  const weight = matrix[6] * x + matrix[7] * y + matrix[8];
  return [
    (matrix[0] * x + matrix[1] * y + matrix[2]) / weight,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / weight,
  ];
}

// 单位矩形不必存入工程；其余点位独立拷贝，历史不会随拖动改变。
export function normalizePerspective(corners) {
  if (corners == null) return null;
  perspectiveMatrix(corners);
  if (corners.every((point, i) => point.every((value, axis) => value === IDENTITY_CORNERS[i][axis]))) return null;
  return corners.map(point => [...point]);
}
