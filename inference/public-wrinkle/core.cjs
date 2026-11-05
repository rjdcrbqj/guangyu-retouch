'use strict';
const { workingSkin } = require('../public-working-skin.cjs');
const { confidence } = require('../public-skin-confidence.cjs');
const { zoneAt } = require('./geometry.cjs');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function creaseField(skin, region, strengths) {
  const { w, h, visible, light, rgb } = skin,
    { crop, zones } = region;
  const n = w * h,
    gains = new Float32Array(n),
    targets = new Float32Array(n),
    slots = new Int8Array(n).fill(-1);
  const radii = [...new Set([2, ...[0.006, 0.013, 0.024].map((s) => Math.max(2, Math.round(w * s)))])];
  const rays = [];
  for (const radius of radii)
    for (let dir = 0; dir < 16; dir++) {
      const theta = (dir * Math.PI) / 16,
        dx = Math.round(radius * Math.cos(theta)),
        dy = Math.round(radius * Math.sin(theta));
      const tx = Math.round(-1.55 * radius * Math.sin(theta)),
        ty = Math.round(1.55 * radius * Math.cos(theta));
      const normal = dx + dy * w,
        tangent = tx + ty * w;
      const path = new Set(),
        interior = new Set();
      for (const [vx, vy, origin] of [
        [dx, dy, 0],
        [tx, ty, 0],
        [dx, dy, tangent],
        [dx, dy, -tangent],
      ]) {
        const count = Math.max(Math.abs(vx), Math.abs(vy));
        for (let k = 0; k <= count; k++) {
          const off = Math.round((k * vx) / count) + Math.round((k * vy) / count) * w;
          path.add(origin + off);
          path.add(origin - off);
          if (origin === 0 && vx === tx && vy === ty && k > 0 && k < count) {
            interior.add(off);
            interior.add(-off);
          }
        }
      }
      rays.push({
        normal,
        tangent,
        path: [...path],
        interior: [...interior],
        mx: Math.abs(dx) + Math.abs(tx),
        my: Math.abs(dy) + Math.abs(ty),
      });
    }
  const deficit = (i, normal) => {
    const a = i - normal,
      b = i + normal,
      L = light[i],
      above = light[a] - L,
      below = light[b] - L;
    const d = Math.min(above, below);
    if (d < Math.max(2.4, L * 0.022) || d > Math.min(61, L * 0.55 + 12) || Math.max(above, below) > d * 4)
      return 0;
    // References must have compatible chromaticity. This rejects many pigmented edges.
    for (const ref of [a, b])
      for (const c of [0, 2]) {
        const chroma = (rgb[i * 3 + c] - L) / Math.max(50, L),
          other = (rgb[ref * 3 + c] - light[ref]) / Math.max(50, light[ref]);
        if (Math.abs(chroma - other) > 0.18) return 0;
      }
    return d;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!visible[i] || light[i] < 20) continue;
      const zone = zoneAt(
        zones,
        crop.left + ((x + 0.5) * crop.width) / w,
        crop.top + ((y + 0.5) * crop.height) / h,
      );
      if (!zone || !strengths[zone.slot]) continue;
      let best = 0;
      for (const ray of rays) {
        if (x < ray.mx || x >= w - ray.mx || y < ray.my || y >= h - ray.my) continue;
        const d = deficit(i, ray.normal);
        if (d <= best) continue;
        const a = i - ray.tangent,
          b = i + ray.tangent;
        const da = deficit(a, ray.normal),
          db = deficit(b, ray.normal);
        const coherent = Math.min(d, da / 0.8, db / 0.8);
        if (
          coherent <= best ||
          Math.max(Math.abs(light[a] - light[i]), Math.abs(light[b] - light[i])) > d * 0.8
        )
          continue;
        if (
          ray.path.some((off) => !visible[i + off]) ||
          ray.interior.some((off) => deficit(i + off, ray.normal) < coherent * 0.35)
        )
          continue;
        best = coherent;
      }
      if (best) {
        targets[i] = light[i] + best;
        gains[i] = Math.min(0.27, best / light[i]) * 0.72;
        slots[i] = zone.slot;
      }
    }
  return { gains, targets, slots };
}
function correctWrinkles(frame, strengths) {
  const { data, width, height, regions } = frame;
  let output = null,
    changedRGBFields = 0;
  const faces = [];
  for (const region of regions) {
    const { crop, zones } = region;
    if (!zones.length || Math.min(crop.width, crop.height) < 26) continue;
    const skin = workingSkin(frame, region),
      { w, h, visible } = skin,
      { gains, targets, slots } = creaseField(skin, region, strengths);
    if (!gains.some(Boolean)) continue;
    let changed = 0;
    const counts = new Array(10).fill(0);
    for (let y = 0; y < crop.height; y++)
      for (let x = 0; x < crop.width; x++) {
        const px = crop.left + x,
          py = crop.top + y,
          i = (py * width + px) * 4;
        if (!data[i + 3]) continue;
        const sx = clamp(((x + 0.5) * w) / crop.width - 0.5, 0, w - 1),
          sy = clamp(((y + 0.5) * h) / crop.height - 0.5, 0, h - 1);
        const ix = Math.floor(sx),
          iy = Math.floor(sy),
          dx = sx - ix,
          dy = sy - iy;
        if (!visible[Math.round(sy) * w + Math.round(sx)]) continue;
        const a = iy * w + ix,
          b = iy * w + Math.min(ix + 1, w - 1),
          c = Math.min(iy + 1, h - 1) * w + ix,
          d = Math.min(iy + 1, h - 1) * w + Math.min(ix + 1, w - 1);
        if (!(gains[a] || gains[b] || gains[c] || gains[d])) continue;
        const zone = zoneAt(zones, px + 0.5, py + 0.5);
        if (!zone || !strengths[zone.slot]) continue;
        const L = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        if (L < 20) continue;
        let gain = 0;
        for (const [p, wgt] of [
          [a, (1 - dx) * (1 - dy)],
          [b, dx * (1 - dy)],
          [c, (1 - dx) * dy],
          [d, dx * dy],
        ]) {
          if (slots[p] === zone.slot) gain += wgt * Math.min(gains[p], Math.max(0, targets[p] - L) / L);
        }
        const amount = Math.min(
          255 / Math.max(data[i], data[i + 1], data[i + 2]) - 1,
          (gain *
            strengths[zone.slot] *
            zone.weight *
            confidence(region, width, height, px, py) *
            data[i + 3]) /
            255,
        );
        let touched = false;
        for (let channel = 0; channel < 3; channel++) {
          const j = i + channel,
            v = Math.round(data[j] * (1 + amount));
          if (v <= (output?.[j] ?? data[j])) continue;
          if (!output) output = new Uint8Array(data);
          if (output[j] === data[j]) changedRGBFields++;
          output[j] = v;
          touched = true;
        }
        if (touched) {
          changed++;
          counts[zone.slot]++;
        }
      }
    if (changed)
      faces.push({
        box: { ...region.box, crop },
        ROI: [crop.left, crop.top, crop.width, crop.height],
        counts,
        changed,
      });
  }
  return { output, faces, changedRGBFields };
}
module.exports = { correctWrinkles };
