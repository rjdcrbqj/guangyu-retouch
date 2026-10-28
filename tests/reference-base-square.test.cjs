'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, '../inference/skin-reference/base-square.cjs');
const api = fs.existsSync(target) ? require(target) : {};
const {refineSuppliedReferenceBaseROI} = require('../inference/skin-reference/base-refine.cjs');
function refine(value) {
  assert.equal(typeof api.refineSuppliedSquareReferenceBase, 'function', 'square adapter API required');
  return api.refineSuppliedSquareReferenceBase(value);
}
function plan(value) {
  assert.equal(typeof api.planSuppliedSquareReferenceBase, 'function', 'acceptedgate geometry planner required');
  return api.planSuppliedSquareReferenceBase(value);
}
function context(side = 9) {
  return {side, guide: new Uint8Array(side * side * 3), mask: new Uint8Array(side * side), rounding: 'nearest-even'};
}
function rectangle(ctx, x, y, width, height, value = 150) {
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) ctx.mask[(y + dy) * ctx.side + x + dx] = value;
  return ctx;
}
function supplied(ctx, radius = 1) {
  const r = Math.max(4, radius) >> 2, count = [0, 5, 13, 29][r];
  ctx.range = new Float32Array(256).fill(1);
  ctx.spatial = new Float32Array(count); ctx.spatial[count >> 1] = 1;
  return ctx;
}
function unreadWeights(ctx) {
  return Object.defineProperties(ctx, {
    range: {get() {throw Error('nohit must not read range getter');}},
    spatial: {get() {throw Error('nohit must not read spatial getter');}}
  });
}
const noWrite = {updated: false, mask: null, ROI: null, radius: null};
for (const side of [1, 2, 3, 4]) test(`S${side} even fullmask is no-write and ignores weights`, () => {
  const ctx = unreadWeights(context(side)); ctx.mask.fill(255);
  assert.deepEqual(refine(ctx), noWrite);
});
for (const side of [5, 9]) test(`S${side} empty no-write ignores weights and preserves inputs`, () => {
  const ctx = unreadWeights(context(side)), guide = ctx.guide.slice(), mask = ctx.mask.slice();
  assert.deepEqual(refine(ctx), noWrite);
  assert.deepEqual(ctx.guide, guide); assert.deepEqual(ctx.mask, mask);
});
for (const [w, h] of [[4, 9], [9, 4], [1, 1]]) test(`bbox${w}x${h} fails gate without requiring tables`, () => {
  const ctx = unreadWeights(rectangle(context(11), 1, 1, w, h));
  assert.deepEqual(refine(ctx), noWrite);
  assert.deepEqual(plan(ctx), {ROI: null, radius: null});
});
test('accepted fullS5 constant150 gives analytic finish131 in an independent mask', () => {
  const ctx = supplied(context(5)); ctx.mask.fill(150);
  const result = refine(ctx);
  assert.equal(result.updated, true); assert.equal(result.radius, 1);
  assert.ok(result.ROI instanceof Int32Array); assert.deepEqual(Array.from(result.ROI), [0, 0, 5, 5]);
  assert.ok(result.mask instanceof Uint8Array); assert.notEqual(result.mask.buffer, ctx.mask.buffer);
  assert.ok(result.mask.every(v => v === 131));
});
for (const [x, y, expected] of [[4, 4, [3, 3, 6, 6]], [0, 0, [0, 0, 6, 6]], [2, 2, [1, 1, 7, 7]]])
  test(`rectangle at${x},${y}: exactROI and analytic131 inside / zerooutside`, () => {
    const ctx = supplied(rectangle(context(9), x, y, 5, 5)), before = [ctx.guide.slice(), ctx.mask.slice(), ctx.range.slice(), ctx.spatial.slice()];
    const result = refine(ctx);
    assert.deepEqual(Array.from(result.ROI), expected);
    const [rx, ry, w, h] = expected;
    for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++)
      assert.equal(result.mask[row * 9 + col], col >= rx && col < rx + w && row >= ry && row < ry + h ? 131 : 0);
    if (x === 4) assert.equal(result.mask[80], 131); // right/bottom9 exclusive; S-1 would omit this pixel
    assert.deepEqual([ctx.guide, ctx.mask, ctx.range, ctx.spatial], before);
  });
test('variedphysicalBYTE3/mask are cropped together and written back at exact coordinates', () => {
  const ctx = supplied(rectangle(context(12), 3, 4, 6, 7));
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) for (let c = 0; c < 3; c++)
    ctx.guide[(y * 12 + x) * 3 + c] = (x * 23 + y * 17 + c * 59) % 256;
  for (let y = 4; y < 11; y++) for (let x = 3; x < 9; x++) ctx.mask[y * 12 + x] = 120 + (x * 9 + y * 7) % 90;
  const before = [ctx.guide.slice(), ctx.mask.slice(), ctx.range.slice(), ctx.spatial.slice()];
  const result = refine(ctx);
  assert.deepEqual(Array.from(result.ROI), [2, 3, 8, 9]);
  // Independent coordinate enumeration, not the adapter's row-subarray extraction.
  const guide = [], mask = [];
  for (let y = 3; y < 12; y++) for (let x = 2; x < 10; x++) {
    mask.push(ctx.mask[y * 12 + x]);
    for (let c = 0; c < 3; c++) guide.push(ctx.guide[(y * 12 + x) * 3 + c]);
  }
  const roi = refineSuppliedReferenceBaseROI({guide: Uint8Array.from(guide), mask: Uint8Array.from(mask), width: 8, height: 9,
    radius: 1, range: ctx.range, spatial: ctx.spatial, rounding: 'nearest-even'});
  const expected = new Uint8Array(144);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) expected[(y + 3) * 12 + x + 2] = roi[y * 8 + x];
  assert.deepEqual(result.mask, expected);
  assert.deepEqual([ctx.guide, ctx.mask, ctx.range, ctx.spatial], before);
});
for (const [M, radius] of [[5, 1], [49, 1], [50, 1], [99, 1], [100, 2], [749, 14], [750, 15], [799, 15], [800, 15], [1490, 15]])
  test(`planner only: maxSide${M} pad${radius} withS1500`, () => {
    const ctx = {side: 1500, mask: new Uint8Array(1500 * 1500), rounding: 'nearest-even'};
    rectangle(ctx, 2, 3, M, 5, 1);
    Object.defineProperties(ctx, {guide: {get() {throw Error('planner must not readguide');}},
      range: {get() {throw Error('planner must not readrange');}}, spatial: {get() {throw Error('planner must not readspatial');}}});
    const result = plan(ctx), x = Math.max(0, 2 - radius), y = Math.max(0, 3 - radius);
    assert.equal(result.radius, radius);
    assert.deepEqual(Array.from(result.ROI), [x, y, Math.min(1500, 2 + M + radius) - x, 3 + 5 + radius - y]);
  });
test('accepted context reads each weightgetter once and forwards supplied arrays', () => {
  const ctx = rectangle(context(5), 0, 0, 5, 5), tables = supplied(context(5));
  let rangeReads = 0, spatialReads = 0;
  Object.defineProperties(ctx, {range: {get() {rangeReads++; return tables.range;}}, spatial: {get() {spatialReads++; return tables.spatial;}}});
  const result = refine(ctx);
  assert.equal(rangeReads, 1); assert.equal(spatialReads, 1); assert.equal(result.updated, true);
});
test('accepted context requires real suppliedtable arguments and does not mutate failed inputs', () => {
  assert.equal(typeof api.refineSuppliedSquareReferenceBase, 'function');
  const ctx = rectangle(context(5), 0, 0, 5, 5), snapshots = [ctx.guide.slice(), ctx.mask.slice()];
  assert.throws(() => refine(ctx));
  assert.deepEqual([ctx.guide, ctx.mask], snapshots);
  supplied(ctx); ctx.range[7] = NaN;
  assert.throws(() => refine(ctx));
  assert.deepEqual([ctx.guide, ctx.mask], snapshots);
});
test('basicpacked layouts/S/explicitrounding are checked even onnohit', () => {
  assert.equal(typeof api.refineSuppliedSquareReferenceBase, 'function');
  const base = context(5);
  for (const patch of [{side: 0}, {side: 1501}, {side: 5.5}, {side: '5'}, {side: NaN},
    {mask: new Uint8ClampedArray(25)}, {mask: new Uint16Array(25)}, {mask: new Uint8Array(24)}, {mask: new Uint8Array(26)},
    {guide: new Uint8Array(74)}, {guide: new Uint8Array(76)}, {guide: new Float32Array(75)},
    {rounding: undefined}, {rounding: 'floor'}, {rounding: null}]) assert.throws(() => refine({...base, ...patch}));
  assert.throws(() => refine(null));
  assert.throws(() => plan({...base, rounding: undefined}));
});
