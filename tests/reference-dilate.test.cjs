'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, '../inference/skin-reference/dilate.cjs');
const api = fs.existsSync(target) ? require(target) : {};
const run = args => {
  assert.equal(typeof api.dilateReferenceMask, 'function', 'dilateReferenceMask API is required');
  return api.dilateReferenceMask(args);
};
const kernel = ['00100', '11111', '11111', '11111', '00100'];
function oracle({data, width: W, height: H}) {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let maximum = 0;
    for (let ky = 0; ky < 5; ky++) for (let kx = 0; kx < 5; kx++) {
      if (kernel[ky][kx] !== '1') continue;
      const sy = y + ky - 2, sx = x + kx - 2;
      const sample = sx < 0 || sy < 0 || sx >= W || sy >= H ? 0 : data[sy * W + sx];
      maximum = Math.max(maximum, sample);
    }
    out[y * W + x] = maximum;
  }
  return out;
}
function args(W = 7, H = 5, data = new Uint8Array(W * H)) {
  return {data, width: W, height: H, rounding: 'nearest-even'};
}
function randomPlane(W, H, seed) {
  const data = new Uint8Array(W * H);
  let state = seed;
  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = 1 + state % 255;
  }
  return data;
}
test('center impulse creates the exact17point footprint with anchor2,2', () => {
  const input = args(9, 9); input.data[4 * 9 + 4] = 231;
  const out = run(input);
  assert.equal(out.filter(v => v !== 0).length, 17);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const inside = x >= 2 && x <= 6 && y >= 2 && y <= 6;
    assert.equal(out[y * 9 + x], inside && kernel[y - 2][x - 2] === '1' ? 231 : 0);
  }
  assert.deepEqual(out, oracle(input));
});
for (const [x, y] of [[0, 0], [4, 0], [0, 4], [4, 4]])
  test(`corner impulse(${x},${y}) matches independent2D oracle`, () => {
    const input = args(5, 5); input.data[y * 5 + x] = 255;
    assert.deepEqual(run(input), oracle(input));
  });
for (const [W, H] of [[5, 5], [6, 7], [8, 5], [9, 6], [17, 9], [31, 7]])
  for (const seed of [1, 42, 0xc0ffee])
    test(`random positiveBYTE ${W}x${H} seed${seed}: independent2D17point oracle`, () => {
      const input = args(W, H, randomPlane(W, H, seed));
      assert.deepEqual(run(input), oracle(input));
    });
test('unsignedBYTE maximum preserves255 and accepts mixed0/128/254', () => {
  const input = args(5, 5, Uint8Array.from({length: 25}, (_, i) => [0, 128, 254][i % 3]));
  input.data[12] = 255;
  const out = run(input);
  assert.equal(out[12], 255);
  assert.deepEqual(out, oracle(input));
});
test('zero and constantBYTE planes retain dimensions and values', () => {
  for (const value of [0, 1, 128, 255]) {
    const input = args(5, 7, new Uint8Array(35).fill(value));
    const out = run(input);
    assert.equal(out.length, 35);
    assert.ok(out.every(v => v === value));
  }
});
test('uses an immutable source snapshot and separate BYTE output', () => {
  const input = args(9, 9); input.data[12] = 177;
  const before = input.data.slice(), out = run(input);
  assert.ok(out instanceof Uint8Array);
  assert.notEqual(out.buffer, input.data.buffer);
  assert.deepEqual(input.data, before);
  assert.deepEqual(out, oracle(input));
  // A recursive in-place growing max would extend beyond this once-only footprint.
  assert.equal(out[8 * 9 + 8], 0);
});
test('supports both maximum axes1500 without changing source', () => {
  for (const [W, H] of [[1500, 5], [5, 1500]]) {
    const input = args(W, H, randomPlane(W, H, 23)), before = input.data.slice();
    assert.deepEqual(run(input), oracle(input));
    assert.deepEqual(input.data, before);
  }
});
test('requires exact packed Uint8Array input and valid integer dimensions', () => {
  assert.equal(typeof api.dilateReferenceMask, 'function');
  const base = args(5, 5);
  for (const patch of [{data: new Uint8ClampedArray(25)}, {data: new Uint16Array(25)}, {data: new Float32Array(25)},
    {data: new Uint8Array(24)}, {data: new Uint8Array(26)}, {width: 4}, {height: 1501}, {width: 5.5}, {height: NaN}, {width: '5'}, {data: null}])
    assert.throws(() => run({...base, ...patch}));
  assert.throws(() => run(null));
});
test('requires explicit nearest-even; omission and other rounding are rejected', () => {
  assert.equal(typeof api.dilateReferenceMask, 'function');
  for (const rounding of [undefined, null, 'floor', 'toward-zero', 'nearest', 0])
    assert.throws(() => run({...args(5, 5), rounding}));
});
