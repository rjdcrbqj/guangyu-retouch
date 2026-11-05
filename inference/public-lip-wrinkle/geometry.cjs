'use strict';
const { lipPolygons } = require('../public-landmarks/regions.cjs'),
  { signedDistance } = require('../public-landmarks/protection.cjs');
const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
function prepareLips(face) {
  const { width, height } = face || {};
  if (![width, height].every((v) => Number.isInteger(v) && v >= 2 && v <= 32766))
    throw Error('嘴唇照片尺寸无效');
  const { outer, inner } = lipPolygons(face, width, height),
    corners = face.type === 'mediapipe-478' ? [61, 291] : [58, 62],
    a = face.points[corners[0]],
    b = face.points[corners[1]],
    dx = (b.x - a.x) * width,
    dy = (b.y - a.y) * height,
    mouthWidth = Math.hypot(dx, dy);
  if (
    mouthWidth < 24 ||
    [...outer, ...inner].some((p) => p.x < 0 || p.y < 0 || p.x >= width || p.y >= height)
  )
    return null;
  const left = Math.max(0, Math.floor(Math.min(...outer.map((p) => p.x))) - 2),
    top = Math.max(0, Math.floor(Math.min(...outer.map((p) => p.y))) - 2),
    right = Math.min(width, Math.ceil(Math.max(...outer.map((p) => p.x))) + 2),
    bottom = Math.min(height, Math.ceil(Math.max(...outer.map((p) => p.y))) + 2);
  return {
    outer,
    inner,
    mouthWidth,
    u: [dx / mouthWidth, dy / mouthWidth],
    margin: Math.max(0.6, mouthWidth * 0.005),
    feather: Math.max(0.75, mouthWidth * 0.008),
    crop: { left, top, width: right - left, height: bottom - top },
  };
}
function lipWeight(g, x, y) {
  return (
    smooth((-signedDistance(x, y, g.outer) - g.margin) / g.feather) *
    smooth((signedDistance(x, y, g.inner) - g.margin) / g.feather)
  );
}
module.exports = { prepareLips, lipWeight };
