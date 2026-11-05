'use strict';
const { confidence } = require('../public-skin-confidence.cjs');
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const {workingSkin}=require('../public-working-skin.cjs');
// A compact spot must differ from skin in opposing directions. Compare against
// the midpoint of each pair so a linear lighting gradient cancels.
function spotField(skin) {
  const { w, h, rgb, visible, light, red } = skin,
    n = w * h,
    delta = new Float32Array(n * 3),
    score = new Float32Array(n),
    family = new Uint8Array(n);
  const radii = [...new Set([0.012, 0.025, 0.043].map((f) => Math.max(2, Math.round(w * f))))];
  for (const radius of radii) {
    const diag = Math.max(1, Math.round(radius / Math.SQRT2));
    const offsets = [
      [radius, 0],
      [0, radius],
      [diag, diag],
      [-diag, diag],
    ];
    for (let y = radius; y < h - radius; y++)
      for (let x = radius; x < w - radius; x++) {
        const p = y * w + x;
        if (!visible[p] || score[p]) continue;
        let valid = true,
          rr = 0,
          gg = 0,
          bb = 0,
          rmin = Infinity,
          gmin = Infinity,
          bmin = Infinity,
          rmax = -Infinity,
          gmax = -Infinity,
          bmax = -Infinity;
        for (const [dx, dy] of offsets) {
          const d = dy * w + dx,
            a = p + d,
            b = p - d;
          if (!visible[a] || !visible[b]) {
            valid = false;
            break;
          }
          const r = (rgb[a * 3] + rgb[b * 3]) * 0.5,
            g = (rgb[a * 3 + 1] + rgb[b * 3 + 1]) * 0.5,
            blue = (rgb[a * 3 + 2] + rgb[b * 3 + 2]) * 0.5;
          rr += r;
          gg += g;
          bb += blue;
          rmin = Math.min(rmin, r);
          gmin = Math.min(gmin, g);
          bmin = Math.min(bmin, blue);
          rmax = Math.max(rmax, r);
          gmax = Math.max(gmax, g);
          bmax = Math.max(bmax, blue);
        }
        if (!valid) continue;
        // Trim the most discordant opposite-pair estimates in each channel.
        rr = (rr - rmin - rmax) * 0.5;
        gg = (gg - gmin - gmax) * 0.5;
        bb = (bb - bmin - bmax) * 0.5;
        const reference = luma(rr, gg, bb);
        if (reference < 20 || reference > 237) continue;
        const dl = reference - light[p],
          dr = red[p] - (rr - gg);
        const redSpot = dr > Math.abs(dl) && dr > 8;
        const signal = redSpot ? dr : dl,
          sign = Math.sign(signal),
          field = redSpot ? red : light;
        const value = Math.abs(signal);
        if (value <= Math.max(score[p], redSpot ? 8 : 6)) continue;
        let agreement = 0;
        for (const [dx, dy] of offsets) {
          const d = dy * w + dx;
          const a = (field[p + d] - field[p]) * (redSpot ? -sign : sign),
            b = (field[p - d] - field[p]) * (redSpot ? -sign : sign);
          if (Math.min(a, b) > 0.36 * value) agreement++;
        }
        if (agreement < 3) continue;
        // Don't take a reference across an eye, mouth, transparency or excluded skin.
        for (const [dx, dy] of offsets) {
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          for (let k = 1; k < steps; k++) {
            const step = Math.round((dy * k) / steps) * w + Math.round((dx * k) / steps);
            if (!visible[p + step] || !visible[p - step]) {
              valid = false;
              break;
            }
          }
          if (!valid) break;
        }
        if (!valid) continue;
        score[p] = value;
        family[p] = redSpot ? 1 : dl > 0 ? 2 : 3;
        delta[p * 3] = rr - rgb[p * 3];
        delta[p * 3 + 1] = gg - rgb[p * 3 + 1];
        delta[p * 3 + 2] = bb - rgb[p * 3 + 2];
      }
  }
  return { delta, score, family };
}
// Flood compact dark components from their peaks. Keep a second peak only if a
// real dip separates it from the deeper one, e.g. a freckle touching a mole.
function darkBasins(pixels, skin, field, owners) {
  const { w } = skin,
    { score, family } = field,
    parents = new Map();
  function root(p) {
    let q = p;
    while (parents.has(q)) q = parents.get(q);
    if (q !== p) parents.set(p, q);
    return q;
  }
  const ordered = pixels.slice().sort((a, b) => score[b] - score[a] || a - b);
  for (const p of ordered) {
    let strongest = -1,
      uphill = -1,
      highest = -1;
    const adjoining = new Set();
    for (const d of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
      const q = p + d;
      if (family[q] !== 2 || !owners[q]) continue;
      const owner = owners[q] - 1,
        basin = root(owner);
      adjoining.add(basin);
      if (strongest < 0 || score[basin] > score[strongest]) strongest = basin;
      if (score[q] > highest) {
        highest = score[q];
        uphill = owner;
      }
    }
    owners[p] = 1 + (uphill < 0 ? p : uphill);
    for (const basin of adjoining)
      if (basin !== strongest && score[basin] - score[p] < Math.max(5, 0.27 * score[basin]))
        parents.set(basin, strongest);
  }
  for (const p of pixels) owners[p] = 1 + root(owners[p] - 1);
}
function isDeepSpot(p, light, delta) {
  const i = p * 3,
    bright = luma(delta[i], delta[i + 1], delta[i + 2]);
  return bright > Math.max(32, (light[p] + bright) * 0.32);
}
function labelSpots(skin, field, settings) {
  const { w, h, light } = skin,
    { delta, score, family } = field,
    seen = new Uint8Array(w * h),
    gain = new Float32Array(w * h);
  const queue = new Int32Array(w * h),
    owners = new Int32Array(w * h),
    counts = { blemish: 0, acne: 0, freckle: 0, removeNevi: 0 };
  for (let start = 0; start < score.length; start++) {
    if (seen[start] || !score[start]) continue;
    let length = 1,
      peak = start,
      minX = w,
      maxX = 0,
      minY = h,
      maxY = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0;
    queue[0] = start;
    seen[start] = 1;
    for (let j = 0; j < length; j++) {
      const p = queue[j],
        x = p % w,
        y = Math.floor(p / w);
      if (score[p] > score[peak]) peak = p;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const px = x + dx,
            py = y + dy;
          if (px < 0 || px >= w || py < 0 || py >= h) continue;
          const next = py * w + px;
          if (seen[next] || family[next] !== family[start]) continue;
          seen[next] = 1;
          queue[length++] = next;
        }
    }
    const bw = maxX - minX + 1,
      bh = maxY - minY + 1;
    if (length < 3 || Math.max(bw, bh) > Math.max(7, w * 0.094) || length / (bw * bh) < 0.33) continue;
    const vx = sxx / length - (sx / length) ** 2,
      vy = syy / length - (sy / length) ** 2,
      cov = sxy / length - (sx * sy) / (length * length);
    if (Math.hypot(vx - vy, 2 * cov) > 0.82 * (vx + vy)) continue;
    const pixels = queue.subarray(0, length);
    const hasDeepPeak = family[peak] === 2 && isDeepSpot(peak, light, delta);
    if (hasDeepPeak) darkBasins(pixels, skin, field, owners);
    const classified = new Map();
    for (const p of pixels) {
      const centre = hasDeepPeak ? owners[p] - 1 : peak;
      if (!classified.has(centre)) {
        const i = centre * 3,
          bright = luma(delta[i], delta[i + 1], delta[i + 2]),
          redness = delta[i + 1] - delta[i];
        const kind = isDeepSpot(centre, light, delta)
          ? 'removeNevi'
          : family[centre] === 1
            ? 'acne'
            : bright > 11 && redness > -2
              ? 'freckle'
              : 'blemish';
        const strength = bright < -32 && light[centre] > 200 ? 0 : Number(settings[kind]);
        classified.set(centre, strength * 0.8);
        if (strength) counts[kind]++;
      }
      gain[p] = classified.get(centre);
    }
  }
  return { gain, counts };
}
function repairSkinSpots(frame, settings) {
  const { width, height, data, regions } = frame;
  const faces = [];
  let output = null,
    changedRGBFields = 0;
  if (!Object.values(settings).some(Boolean)) return { output, faces, changedRGBFields };
  for (const region of regions) {
    const { crop } = region;
    if (Math.min(crop.width, crop.height) < 24) continue;
    const skin = workingSkin(frame, region),
      { w, h, rgb } = skin,
      field = spotField(skin),
      { gain, counts } = labelSpots(skin, field, settings);
    if (!Object.values(counts).some(Boolean)) continue;
    let changed = 0;
    for (let y = 0; y < crop.height; y++)
      for (let x = 0; x < crop.width; x++) {
        const sx = clamp(((x + 0.5) * w) / crop.width - 0.5, 0, w - 1),
          sy = clamp(((y + 0.5) * h) / crop.height - 0.5, 0, h - 1);
        const ix = Math.floor(sx),
          iy = Math.floor(sy),
          dx = sx - ix,
          dy = sy - iy;
        const i = ((crop.top + y) * width + crop.left + x) * 4;
        if (!data[i + 3] || !skin.visible[Math.round(sy) * w + Math.round(sx)]) continue;
        let dr = 0,
          dg = 0,
          db = 0;
        for (let j = 0; j < 2; j++)
          for (let k = 0; k < 2; k++) {
            const p = Math.min(h - 1, iy + j) * w + Math.min(w - 1, ix + k),
              g = gain[p];
            if (!g) continue;
            const a = (k ? dx : 1 - dx) * (j ? dy : 1 - dy) * g,
              idx = p * 3;
            // Only reduce an outstanding difference from the local skin reference.
            for (let c = 0; c < 3; c++) {
              const d = field.delta[idx + c],
                toward = rgb[idx + c] + d - data[i + c];
              const amount = Math.sign(d) * Math.max(0, Math.min(Math.abs(d), Math.sign(d) * toward)) * a;
              if (c === 0) dr += amount;
              else if (c === 1) dg += amount;
              else db += amount;
            }
          }
        if (!dr && !dg && !db) continue;
        const weight = (confidence(region, width, height, crop.left + x, crop.top + y) * data[i + 3]) / 255;
        const r = Math.round(data[i] + dr * weight),
          g = Math.round(data[i + 1] + dg * weight),
          b = Math.round(data[i + 2] + db * weight);
        const magnitude = Math.abs(r - data[i]) + Math.abs(g - data[i + 1]) + Math.abs(b - data[i + 2]);
        if (!magnitude) continue;
        if (!output) output = new Uint8Array(data);
        if (
          magnitude <=
          Math.abs(output[i] - data[i]) +
            Math.abs(output[i + 1] - data[i + 1]) +
            Math.abs(output[i + 2] - data[i + 2])
        )
          continue;
        changedRGBFields +=
          (r !== data[i]) +
          (g !== data[i + 1]) +
          (b !== data[i + 2]) -
          (output[i] !== data[i]) -
          (output[i + 1] !== data[i + 1]) -
          (output[i + 2] !== data[i + 2]);
        output[i] = r;
        output[i + 1] = g;
        output[i + 2] = b;
        changed++;
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
module.exports = { repairSkinSpots };
