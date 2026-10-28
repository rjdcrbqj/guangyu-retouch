'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '../inference/skin-reference/bilateral.cjs');
const api = fs.existsSync(modulePath) ? require(modulePath) : {};
const call = args => {
  assert.equal(typeof api.bilateralSuppliedWeights, 'function', 'bilateralSuppliedWeights API is required');
  return api.bilateralSuppliedWeights(args);
};
const counts = [0, 5, 13, 29];
function tables(r, varied = true) {
  const range = Float32Array.from({length: 256}, (_, i) => varied ? ((i % 17) + 1) / 31 : 1);
  const spatial = Float32Array.from({length: counts[r]}, (_, i) => varied ? ((i * 3) % 11 + 1) / 13 : 1);
  range[0] = 1;
  spatial[spatial.length >> 1] = 1;
  return {range, spatial};
}
function fixture(r, W = 7, H = 5) {
  return {data: Uint8Array.from({length: W * H}, (_, i) => (i * 61 + Math.floor(i / W) * 23) % 256), width: W, height: H, radius: r, ...tables(r), rounding: 'nearest-even'};
}

// Exact positive rational binary32 oracle, independent of Math.fround.
const scratch = new DataView(new ArrayBuffer(4));
function rational(value) {
  scratch.setFloat32(0, value, true);
  const bits = scratch.getUint32(0, true), exponent = (bits >>> 23) & 255;
  const m = BigInt(exponent ? (bits & 0x7fffff) + 0x800000 : bits & 0x7fffff);
  const power = exponent ? exponent - 150 : -149;
  return power >= 0 ? [m << BigInt(power), 1n] : [m, 1n << BigInt(-power)];
}
function nearestInteger(n, d) {
  const q = n / d, remainder = n % d;
  return q + (remainder * 2n > d || (remainder * 2n === d && (q & 1n)) ? 1n : 0n);
}
function roundedF32(n, d) {
  if (n === 0n) return 0;
  let e = n.toString(2).length - d.toString(2).length;
  if (e >= 0 ? n < (d << BigInt(e)) : (n << BigInt(-e)) < d) e--;
  const shift = e < -126 ? 149 : 23 - e;
  let m = shift >= 0 ? nearestInteger(n << BigInt(shift), d) : nearestInteger(n, d << BigInt(-shift));
  let bits;
  if (e < -126) bits = Number(m);
  else {
    if (m === 0x1000000n) {m >>= 1n; e++;}
    bits = (e + 127) * 0x800000 + Number(m - 0x800000n);
  }
  scratch.setUint32(0, bits, true);
  return scratch.getFloat32(0, true);
}
function exactOp(a, b, operation) {
  const [an, ad] = rational(a), [bn, bd] = rational(b);
  if (operation === 'add') return roundedF32(an * bd + bn * ad, ad * bd);
  if (operation === 'mul') return roundedF32(an * bn, ad * bd);
  return roundedF32(an * bd, ad * bn);
}
function reflected(i, n) {
  const period = 2 * (n - 1), phase = ((i % period) + period) % period;
  return phase < n ? phase : period - phase;
}
function oracle(args) {
  const {data, width: W, height: H, radius: r, range, spatial} = args, k = 2 * r + 1;
  const offsets = Array.from({length: k * k}, (_, i) => [i % k - r, Math.floor(i / k) - r])
    .filter(([dx, dy]) => dx * dx + dy * dy <= r * r);
  const out = new Uint8Array(data.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const center = data[y * W + x];
    let denominator = 0, numerator = 0;
    offsets.forEach(([dx, dy], j) => {
      const pixel = data[reflected(y + dy, H) * W + reflected(x + dx, W)];
      const weight = exactOp(spatial[j], range[Math.abs(pixel - center)], 'mul');
      denominator = exactOp(denominator, weight, 'add');
      numerator = exactOp(numerator, exactOp(pixel, weight, 'mul'), 'add');
    });
    const [n, d] = rational(exactOp(numerator, denominator, 'div'));
    out[y * W + x] = Number(nearestInteger(n, d));
  }
  return out;
}

for (const r of [1, 2, 3]) for (const W of [5, 8, 9, 17])
  test(`r${r} W${W} explicit varied tables: exact rational F32 oracle`, () => {
    const args = fixture(r, W, 6);
    assert.deepEqual(call(args), oracle(args));
  });
for (const r of [1, 2, 3]) test(`r${r} source and supplied tables are unchanged`, () => {
  const args = fixture(r), snapshots = [args.data.slice(), args.range.slice(), args.spatial.slice()];
  const out = call(args);
  assert.ok(out instanceof Uint8Array);
  assert.equal(out.length, args.data.length);
  assert.notEqual(out.buffer, args.data.buffer);
  assert.deepEqual([args.data, args.range, args.spatial], snapshots);
});
test('nearest-even resolves 10.5 to10 and11.5 to12 without +.5', () => {
  const args = fixture(1, 5, 5);
  args.data.fill(0); args.range.fill(1); args.spatial.set([1, 0, 1, 0, 0]);
  args.data[11] = 10; args.data[6] = 11; args.data[13] = 11; args.data[8] = 12;
  const out = call(args);
  assert.equal(out[11], 10); assert.equal(out[13], 12);
  assert.deepEqual(out, oracle(args));
});
test('border4 excludes repeated corner endpoints', () => {
  const args = fixture(1, 5, 5);
  args.data.fill(0); args.data[0] = 9; Object.assign(args, tables(1, false));
  const out = call(args);
  assert.equal(out[0], 2); assert.equal(out[1], 2); assert.equal(out[5], 2); assert.equal(out[6], 0);
  assert.deepEqual(out, oracle(args));
});
test('asymmetric spatial table follows original dy-then-dx disk enumeration', () => {
  const args = fixture(2), out = call(args);
  assert.deepEqual(out, oracle(args));
  const reversed = {...args, spatial: args.spatial.slice().reverse()};
  assert.notDeepEqual(out, oracle(reversed));
});
for (const r of [1, 2, 3]) test(`r${r} center-only weights preserve pixels including borders`, () => {
  const args = fixture(r); args.spatial.fill(0); args.spatial[counts[r] >> 1] = 1;
  assert.deepEqual(call(args), args.data);
});
test('smallest subnormal products underflow separately while center keeps denominator positive', () => {
  const args = fixture(3); args.range.fill(2 ** -149); args.range[0] = 1;
  args.spatial.fill(2 ** -149); args.spatial[14] = 1;
  const out = call(args);
  assert.deepEqual(out, args.data); assert.deepEqual(out, oracle(args));
});
test('valid positive weights preserve constant0 and255', () => {
  for (const value of [0, 255]) for (const r of [1, 2, 3]) {
    const args = fixture(r); args.data.fill(value);
    assert.ok(call(args).every(v => v === value));
  }
});
test('maximum width and height1500 remain supported with radius3', () => {
  for (const [W, H] of [[1500, 5], [5, 1500]]) {
    const args = fixture(3, W, H); args.spatial.fill(0); args.spatial[14] = 1;
    assert.deepEqual(call(args), args.data);
  }
});
test('rejects invalid depth, dimensions, radius, packed length and rounding', () => {
  assert.equal(typeof api.bilateralSuppliedWeights, 'function');
  const base = fixture(1, 5, 5);
  for (const patch of [{data: new Uint8ClampedArray(25)}, {data: new Uint16Array(25)}, {data: new Uint8Array(24)}, {data: new Uint8Array(26)},
    {width: 4}, {height: 1501}, {width: 5.5}, {height: Infinity}, {radius: 0}, {radius: 4}, {radius: 1.5}, {rounding: 'floor'}, {rounding: null}])
    assert.throws(() => call({...base, ...patch}));
  assert.throws(() => call(null));
});
test('requires explicit FLOAT tables, valid lengths and exact center weights1', () => {
  assert.equal(typeof api.bilateralSuppliedWeights, 'function');
  const base = fixture(1, 5, 5);
  for (const patch of [{range: undefined}, {spatial: undefined}, {range: new Float64Array(256)}, {spatial: new Float64Array(5)},
    {range: new Float32Array(255)}, {spatial: new Float32Array(13)}, {range: new Float32Array(256)}, {spatial: new Float32Array(5)}])
    assert.throws(() => call({...base, ...patch}));
});
test('rejects every nonfinite/out-of-range weight before work', () => {
  assert.equal(typeof api.bilateralSuppliedWeights, 'function');
  for (const field of ['range', 'spatial']) for (const value of [NaN, Infinity, -Infinity, -0.001, 1.001]) {
    const args = fixture(1); args[field][1] = value;
    assert.throws(() => call(args));
  }
});
test('rounding defaults only to nearest-even; source contains no weight provider substitution', () => {
  const args = fixture(1); delete args.rounding;
  assert.deepEqual(call(args), oracle(args));
  assert.doesNotMatch(fs.readFileSync(modulePath, 'utf8'), /Math\s*\.\s*exp\s*\(/);
});
