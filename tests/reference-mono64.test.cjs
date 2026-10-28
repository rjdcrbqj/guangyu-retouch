'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
function api() { return require('../inference/skin-reference/mono64.cjs').resizeReferenceMono64; }
function request(data, width, height, stride = width) {
  return { data, width, height, stride, math: 'native-code2-scalar' };
}
function digest(data) { return createHash('sha256').update(data).digest('hex'); }

test('mono64 source1 uses single-load indices; one row needs no trailing padding', () => {
  const run = api();
  const one = Uint8Array.of(173);
  const single = run(request(one, 1, 1, 91));
  assert.deepEqual([single.width, single.height, single.stride, single.data.length], [64, 64, 64, 4096]);
  assert.ok(single.data.every(v => v === 173));
  assert.deepEqual(one, Uint8Array.of(173));
  const column = Uint8Array.from([3, 201, 201, 201, 201, 127, 201, 201, 201, 201, 249]);
  const before = column.slice();
  const out = run(request(column, 1, 3, 5));
  for (const [y, expected] of [[0, 3], [20, 3], [21, 127], [42, 127], [43, 249], [63, 249]]) {
    assert.ok(out.data.subarray(y * 64, (y + 1) * 64).every(v => v === expected));
  }
  const horizontal = run(request(Uint8Array.of(0, 255), 2, 1, 20));
  assert.equal(horizontal.data[63], 253); // 7位端点权127，不能强行复制最后源像素。
  for (let y = 1; y < 64; y++) assert.deepEqual(horizontal.data.slice(y * 64, (y + 1) * 64), horizontal.data.slice(0, 64));
  assert.deepEqual(column, before);
});

test('mono64 W64 row-only Y differs from general W2 and nearest W1', () => {
  const run = api();
  const observed = [];
  for (const width of [64, 2, 1]) {
    const data = new Uint8Array(width * 32);
    data.fill(255, width, 2 * width);
    observed.push(run(request(data, width, 32)).data[64]);
  }
  assert.deepEqual(observed, [128, 125, 0]); // 独立手算权128/125及nearest首行。
  const row = Uint8Array.from({ length: 64 }, (_, x) => (x * 3 + 7) % 256);
  const out = run(request(row, 64, 1, 999));
  for (let y = 0; y < 64; y++) assert.deepEqual(out.data.slice(y * 64, (y + 1) * 64), row);
});

test('mono64 preserves horizontal BYTE stage before vertical rounded8 math', () => {
  const run = api(), source = Uint8Array.of(0, 0, 0, 255);
  const out = run(request(source, 2, 2));
  assert.equal(out.data[0], 0);
  assert.equal(out.data[32 * 64 + 32], 66); // H=(255*65+64)//128=129; V=(129*130+128)//256=66。
  assert.equal(out.data[4095], 252); // H末端253，V权255后252；两次BYTE舍入。
  assert.deepEqual(source, Uint8Array.of(0, 0, 0, 255));
});

// 11份全新4096BYTE golden由域外Fraction整数oracle生成；不导入产品计算期望。
const golden = [
  [1, 1, 173, 'c79513a4b6b8d0813796f557d2336f00938b501152aba9cc40e9a2f0c9fde121'],
  [1, 7, 19, 'b1d16e5b32a8d70d2a592a75ef80faa760f1c71b8dc096d17d9926104ee6bf5d'],
  [1, 64, 71, 'fa6a46c595ab269420596090d2738559c1d334f17872903d7dd0349bc9b0be79'],
  [64, 1, 23, 'f57f7049cbc3d8a23809bfa98c3d49facde15aa56bdbe3a4e44a6d5d4bea75d4'],
  [64, 32, 5, 'b5282a99ad793060c4af867898e6c389da0cad9dc4ed513b86c65284b603a510'],
  [64, 64, 3, 'e04dfc8dcfbb16370bc163045e2f750a9339208e458f31c788bf4f63615c0604'],
  [2, 64, 41, '24c56ab95b28abe91936e6f2d186d6774000210df43feb2452002a337741cae9'],
  [7, 1, 17, 'fb4f2f60d78a1e61db7884891e221e817a466ed2dfb8635714d15fd52bd92ffe'],
  [7, 11, 97, '9d92f2fd2bd1aa833658261ba8529aa883419198e795189ebf89d25b40b9d921'],
  [63, 5, 43, '9d933116667b3f775fec9c13a44d2bfd1fe458e127a6b067252e8063ab8fb6f5'],
  [63, 63, 29, 'd18d6ebee3a2e78a58c7fd925323c17562190c674b28615ca3e7f9b5d83ef6e1'],
];
test('mono64 new independent integer golden: 45056BYTE across five routes, anisotropy and strides', () => {
  const run = api();
  for (const [width, height, seed, expectedSHA] of golden) {
    const stride = width + 5, span = (height - 1) * stride + width;
    const backing = new Uint8Array(span + 21).fill(211);
    const data = new Uint8Array(backing.buffer, 9, span);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      data[y * stride + x] = (x * 37 + y * 53 + x * y * 11 + seed * (1 + x % 3) + ((x + y) % 5) * 23) % 256;
    }
    const before = backing.slice(), out = run(request(data, width, height, stride));
    assert.equal(out.data.length, 4096);
    assert.equal(digest(out.data), expectedSHA, `${width}x${height}`);
    assert.deepEqual(backing, before);
    assert.notEqual(out.data.buffer, data.buffer);
  }
});

test('mono64 64x64 copy respects minimal active-row span and separate duplicate outputs', () => {
  const run = api(), stride = 69;
  const data = Uint8Array.from({ length: 63 * stride + 64 }, (_, i) => (i * 31 + 19) % 256);
  const before = data.slice(), r = request(data, 64, 64, stride), a = run(r), b = run(r);
  for (let y = 0; y < 64; y++) assert.deepEqual(a.data.slice(y * 64, (y + 1) * 64), data.slice(y * stride, y * stride + 64));
  assert.notEqual(a.data.buffer, b.data.buffer);
  a.data.fill(0);
  assert.equal(b.data[0], 19);
  assert.deepEqual(data, before);
});

test('mono64 validates explicit scalar math, BYTE1, bounded integer sizes and safe final-row span', () => {
  const run = api(), r = request(Uint8Array.of(17, 19, 23, 29), 2, 2);
  for (const change of [
    { width: 0 }, { height: 65 }, { width: 2.5 }, { height: NaN }, { width: Infinity },
    { stride: 1 }, { stride: 2.5 }, { stride: 0 }, { stride: Infinity },
    { stride: Number.MAX_SAFE_INTEGER }, { stride: Number.MAX_SAFE_INTEGER + 1 },
    { data: Uint8Array.of(17, 19, 23) }, { data: new Float32Array(4) },
    { data: new Uint8ClampedArray(4) }, { math: undefined }, { math: 'linear' },
  ]) assert.throws(() => run({ ...r, ...change }));
  assert.throws(() => run(null));
  assert.throws(() => run());
  assert.ok(run(request(Uint8Array.of(81), 1, 1, Number.MAX_SAFE_INTEGER)).data.every(v => v === 81));
  assert.deepEqual(r.data, Uint8Array.of(17, 19, 23, 29));
});
