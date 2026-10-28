'use strict';
const f = Math.fround;

// 1444fbf90 的列向量平方范数；公开参数是逻辑 N×2 row-major。
function squareNormColumn(points, column) {
  const n = points.length;
  const sq = i => f(f(points[i][column]) * f(points[i][column]));
  if (n === 0) return 0;
  if (n < 4) {
    let sum = sq(0);
    for (let i = 1; i < n; i++) sum = f(sum + sq(i));
    return sum;
  }
  const lanes = [sq(0), sq(1), sq(2), sq(3)];
  const end4 = n - n % 4;
  if (n >= 8) {
    const high = [sq(4), sq(5), sq(6), sq(7)];
    const end8 = n - n % 8;
    for (let i = 8; i < end8; i += 8) {
      for (let k = 0; k < 4; k++) {
        lanes[k] = f(lanes[k] + sq(i + k));
        high[k] = f(high[k] + sq(i + k + 4));
      }
    }
    for (let k = 0; k < 4; k++) lanes[k] = f(high[k] + lanes[k]);
    if (end8 < end4) for (let k = 0; k < 4; k++) lanes[k] = f(lanes[k] + sq(end8 + k));
  }
  // unpckhpd/addps/shufps 55/addss: (lane3+lane1)+(lane2+lane0)。
  let sum = f(f(lanes[3] + lanes[1]) + f(lanes[2] + lanes[0]));
  for (let i = end4; i < n; i++) sum = f(sum + sq(i));
  return sum;
}

function fitPost({centeredSource, sourceMean, targetMean, U, V, singularValues, determinantOriginal}) {
  if (typeof determinantOriginal !== 'function') throw new TypeError('Original determinant adapter required');
  const n = centeredSource.length;
  const variance = f(f(squareNormColumn(centeredSource, 0) + squareNormColumn(centeredSource, 1)) * f(1 / f(n)));
  const detU = determinantOriginal(U), detV = determinantOriginal(V);
  const sign = f(detU * detV) < 0 ? -1 : 1;
  // 144527450 先逐列乘 sign，再乘 V 转置；2项内积以首项初始化。
  const signedU = U.map(row => [f(row[0]), f(f(row[1]) * sign)]);
  const rotation = signedU.map(row => V.map(vrow => f(f(row[0] * f(vrow[0])) + f(row[1] * f(vrow[1])))));
  const signedSingularSum = f(f(singularValues[0]) + f(f(singularValues[1]) * sign));
  // 1444fd687..691: reciprocal(variance) 然后乘 singular sum，不能合并除法。
  const scale = f(f(1 / variance) * signedSingularSum);
  // 14326dba0 的实际2维 tail：从 +0 累加未缩放内积，末尾乘 -scale 后加 targetMean。
  const translation = rotation.map((row, r) => {
    const dot = f(f(0 + f(row[0] * f(sourceMean[0]))) + f(row[1] * f(sourceMean[1])));
    return f(f(dot * f(-scale)) + f(targetMean[r]));
  });
  const affine = rotation.map((row, r) => [f(row[0] * scale), f(row[1] * scale), translation[r]]);
  return {affine, variance, scale, rotation, translation, sign, detU, detV, signedSingularSum};
}
module.exports = {squareNormColumn, fitPost};
