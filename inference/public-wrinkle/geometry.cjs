'use strict';
function wrinkleZones(face) {
  const { points, width, height } = face;
  if (face.type !== 'mediapipe-478' || points?.length !== 478) throw Error('祛皱需要可靠的公开面部定位');
  const xy = (i) => ({ x: points[i].x * width, y: points[i].y * height }),
    outerRight = xy(33),
    outerLeft = xy(263);
  const eyeSpan = Math.hypot(outerLeft.x - outerRight.x, outerLeft.y - outerRight.y);
  if (eyeSpan < 16) return [];
  const ux = (outerLeft.x - outerRight.x) / eyeSpan,
    uy = (outerLeft.y - outerRight.y) / eyeSpan;
  const down = (xy(152).x - xy(10).x) * -uy + (xy(152).y - xy(10).y) * ux >= 0 ? 1 : -1;
  const breadth = eyeSpan / 0.66,
    shift = (p, x, y) => ({
      x: p.x + breadth * (ux * x - uy * y * down),
      y: p.y + breadth * (uy * x + ux * y * down),
    });
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const zones = [];
  function band(slot, a, b, r) {
    zones.push({ slot, ax: a.x, ay: a.y, bx: b.x, by: b.y, r: r * breadth });
  }
  // All left/right controls follow the portrait subject, as in the eye controls.
  for (const s of [-1, 1]) {
    const left = s === 1,
      eye = xy(left ? 263 : 33),
      lower = xy(left ? 374 : 145),
      wing = xy(left ? 327 : 98),
      corner = xy(left ? 291 : 61);
    const fold = shift(mix(wing, corner, 0.5), s * 0.034, 0);
    band(left ? 0 : 1, shift(wing, s * 0.022, 0.018), fold, 0.045);
    band(left ? 0 : 1, fold, shift(corner, s * 0.044, 0.01), 0.046);
    band(left ? 4 : 3, shift(lower, 0, 0.077), shift(eye, s * 0.036, 0.033), 0.052);
    band(left ? 4 : 3, shift(eye, s * 0.032, 0.006), shift(eye, s * 0.125, -0.005), 0.06);
    band(
      6,
      shift(corner, s * 0.024, 0.045),
      mix(shift(corner, s * 0.08, 0.085), xy(left ? 365 : 136), 0.27),
      0.052,
    );
    band(8, xy(left ? 352 : 123), xy(left ? 425 : 205), 0.093);
    band(9, shift(xy(0), s * 0.022, -0.079), shift(corner, -s * 0.03, -0.067), 0.049);
    band(9, mix(xy(17), xy(152), 0.25), shift(corner, -s * 0.028, 0.071), 0.057);
  }
  const top = xy(10),
    brow = xy(9);
  for (const t of [0.32, 0.6]) {
    const c = mix(top, brow, t);
    band(2, shift(c, -0.237, 0), shift(c, 0.237, 0), 0.084);
  }
  band(7, shift(brow, 0, -0.035), xy(168), 0.051);
  band(5, shift(xy(168), 0, 0.036), xy(4), 0.061);
  return zones;
}
function zoneAt(zones, x, y) {
  let best = 1,
    slot = -1;
  for (const z of zones) {
    const dx = z.bx - z.ax,
      dy = z.by - z.ay,
      px = x - z.ax,
      py = y - z.ay;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    const distance = ((px - t * dx) ** 2 + (py - t * dy) ** 2) / (z.r * z.r);
    if (distance < best) {
      best = distance;
      slot = z.slot;
    }
  }
  if (slot < 0) return null;
  const t = Math.min(1, (1 - Math.sqrt(best)) / 0.42);
  return { slot, weight: t * t * (3 - 2 * t) };
}
module.exports = { wrinkleZones, zoneAt };
