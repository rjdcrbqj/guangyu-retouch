'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, '../inference/skin-reference/guided-mean.cjs');
const api = fs.existsSync(target) ? require(target) : {};
const invoke = args => {
  assert.equal(typeof api.guidedMean, 'function', 'guidedMean export is required');
  return api.guidedMean(args);
};
const f = Math.fround;
const types = { 0: Uint8Array, 2: Uint16Array, 5: Float32Array };
const bitView = values => Array.from(new Uint32Array(values.buffer, values.byteOffset, values.length));

// Independent finite border extension: a 2*N periodic mirrored sequence.
function folded(i, n) {
  const cycle = ((i % (2 * n)) + 2 * n) % (2 * n);
  return cycle < n ? cycle : 2 * n - cycle - 1;
}
function integerOracle({data, width: W, height: H, radius: r, depth}) {
  const k = 2 * r + 1, divisor = k * k, prefix = depth === 0 ? 8 : 4;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let exact = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      exact += data[folded(y + dy, H) * W + folded(x + dx, W)];
    out[y * W + x] = x < W - W % prefix ? f(f(exact) * f(1 / divisor)) : f(exact * (1 / divisor));
  }
  return out;
}
// Separate register trace over fully materialized padded rows; no production helpers.
function floatOracle({data, width: W, height: H, radius: r}) {
  const k = 2 * r + 1, rows = [];
  for (let y = 0; y < H; y++) {
    const extended = Array.from({length: W + 2 * r}, (_, j) => data[y * W + folded(j - r, W)]);
    const row = [];
    if (r < 3) {
      for (let x = 0; x < W; x++) {
        let register = extended[x];
        for (let j = 1; j < k; j++) register = f(register + extended[x + j]);
        row.push(register);
      }
    } else {
      let register = 0;
      for (const value of extended.slice(0, k)) register = f(register + value);
      row.push(register);
      for (let x = 1; x < W; x++) {
        const delta = f(extended[x + k - 1] - extended[x - 1]);
        register = f(register + delta);
        row.push(register);
      }
    }
    rows.push(row);
  }
  const paddedRows = Array.from({length: H + 2 * r}, (_, j) => rows[folded(j - r, H)]);
  const result = new Float32Array(W * H), scale = f(1 / (k * k));
  for (let x = 0; x < W; x++) {
    let register = 0;
    for (const row of paddedRows.slice(0, k - 1)) register = f(register + row[x]);
    for (let y = 0; y < H; y++) {
      const total = f(register + paddedRows[y + k - 1][x]);
      result[y * W + x] = f(total * scale);
      register = f(total - paddedRows[y][x]);
    }
  }
  return result;
}
function argsFor(depth, W, H, r, value) {
  return {data: types[depth].from({length: W * H}, (_, i) => value(i % W, Math.floor(i / W))), width: W, height: H, radius: r, depth};
}

test('packed API returns a separate FLOAT plane and preserves each input depth', () => {
  for (const depth of [0, 2, 5]) {
    const args = argsFor(depth, 9, 7, 2, () => 27), before = args.data.slice();
    const result = invoke(args);
    assert.ok(result instanceof Float32Array);
    assert.equal(result.length, 63);
    assert.notEqual(result.buffer, args.data.buffer);
    assert.deepEqual(args.data, before);
    assert.ok(result.every(v => v === 27));
  }
});
for (const depth of [0, 2]) {
  for (const r of [1, 2, 3, 15]) test(`depth${depth} r${r}: complete 2D integer oracle / small repeated borders`, () => {
    const args = argsFor(depth, 7, 5, r, (x, y) => depth === 0 ? (x * 71 + y * 37) % 256 : (x * 10937 + y * 19391) % 65536);
    assert.deepEqual(bitView(invoke(args)), bitView(integerOracle(args)));
  });
  for (const W of [5, 8, 9, 12, 15, 16, 17, 31]) test(`depth${depth} W${W}: prefix and Double remainder boundary`, () => {
    const args = argsFor(depth, W, 6, 2, (x, y) => depth === 0 ? (x * 31 + y * 13 + 1) % 256 : (x * 6107 + y * 251 + 1) % 65536);
    assert.deepEqual(bitView(invoke(args)), bitView(integerOracle(args)));
  });
}
test('BYTE SSE8 vs Double4 remainder gives different bits for the same total=17', () => {
  const args = argsFor(0, 12, 5, 1, (x, y) => [1, 1, y === 2 ? 5 : 3][x % 3]), result = invoke(args);
  assert.equal(result[25], 1.888888955116272);
  assert.equal(result[32], 1.8888888359069824);
  assert.notEqual(result[25], result[32]);
});
test('UINT16 product SSE4 vs Double tail gives different bits for total=17', () => {
  const result = invoke(argsFor(2, 7, 5, 1, (x, y) => [1, 1, y === 2 ? 5 : 3][x % 3]));
  assert.equal(result[15], 1.888888955116272);
  assert.equal(result[18], 1.8888888359069824);
});
for (const r of [1, 2, 3, 15]) for (const W of [5, 12, 17])
  test(`FLOAT r${r} W${W}: fresh padded-row register oracle`, () => {
    const values = [f(1e17), f(-1e17), f(1 / 3), -111.125, 32767.5, -0.00001, 19.25];
    const args = argsFor(5, W, 7, r, (x, y) => values[(x * 3 + y * 2) % values.length]);
    assert.deepEqual(bitView(invoke(args)), bitView(floatOracle(args)));
  });
test('FLOAT r1 uses direct k3 sums instead of rolling', () => {
  const result = invoke(argsFor(5, 5, 5, 1, x => [1e20, -1e20, 3, 4, 5][x]));
  assert.equal(result[1], 1); // rolling row result would be zero
});
test('FLOAT r2 uses direct k5 sums instead of rolling', () => {
  const result = invoke(argsFor(5, 5, 5, 2, x => [1e20, -1e20, 3, 4, 5][x]));
  assert.equal(result[2], f(60 * f(1 / 25))); // rolling row result would be zero
});
test('FLOAT r3 rounds enter-minus-leave before adding the sliding sum', () => {
  const args = argsFor(5, 5, 5, 3, x => [0, 0, 3, 1e20, -1e20][x]);
  const result = invoke(args);
  assert.equal(result[1], 0); // add-enter-then-subtract-leave would leave -3 horizontally
  assert.deepEqual(bitView(result), bitView(floatOracle(args)));
});
test('repeated endpoints preserve an integer impulse near corners', () => {
  const args = argsFor(0, 5, 5, 1, (x, y) => x === 0 && y === 0 ? 9 : 0), out = invoke(args);
  assert.equal(out[0], 4);
  assert.equal(out[1], 2);
  assert.equal(out[5], 2);
  assert.equal(out[6], 1);
  assert.equal(out[24], 0);
});
test('maximum axis and UINT16 amplitude stay in proven integer range', () => {
  for (const [W, H] of [[1500, 5], [5, 1500]]) {
    const out = invoke(argsFor(2, W, H, 15, () => 65535));
    const total = 65535 * 31 * 31, prefix = W - W % 4;
    assert.equal(out[0], f(f(total) * f(1 / (31 * 31))));
    if (prefix < W) assert.equal(out[prefix], 65535);
  }
});
test('FLOAT finite guard rejects input NaN/Infinity and arithmetic overflow', () => {
  for (const bad of [NaN, Infinity, -Infinity]) assert.throws(() => invoke(argsFor(5, 5, 5, 1, () => bad)), /finite|有限/i);
  assert.throws(() => invoke(argsFor(5, 5, 5, 3, () => f(3e38))), /finite|有限/i);
});
test('rejects wrong type, packed length, depth, size and radius before computation', () => {
  assert.equal(typeof api.guidedMean, 'function');
  const base = argsFor(0, 5, 5, 1, () => 1);
  for (const patch of [
    {data: new Uint8ClampedArray(25)}, {data: new Uint16Array(25)}, {data: new Uint8Array(26)}, {data: new Uint8Array(24)},
    {depth: 1}, {depth: '0'}, {width: 4}, {height: 1501}, {width: 5.5}, {height: NaN},
    {radius: 0}, {radius: 16}, {radius: 1.5}, {radius: Infinity}
  ]) assert.throws(() => invoke({...base, ...patch}));
  assert.throws(() => invoke(null));
});
