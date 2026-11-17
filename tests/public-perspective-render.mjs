import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const { _electron } = playwright;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const application = process.env.GUANGYU_TEST_APP_ROOT || root;
const profile = process.env.GUANGYU_TEST_EXECUTABLE ? 'public-perspective-installed-render-profile' : 'public-perspective-render-profile';
const app = await _electron.launch({
  executablePath: process.env.GUANGYU_TEST_EXECUTABLE || path.join(root, 'runtime/electron.exe'),
  args: [application, '--user-data-dir=' + path.join(root, 'dist', profile)],
  env,
});

try {
  const page = await app.firstWindow();
  await page.locator('#hand.active').waitFor();
  const result = await page.evaluate(async () => {
    const { PhotoEngine } = await import('./src/engine.js');
    const { perspectiveMatrix, mapPerspective, IDENTITY_CORNERS } = await import('./src/public-perspective.js');
    const width = 257, height = 65;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const context = source.getContext('2d');
    const data = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        data.data.set([x * .8, y * 3, 150, 80 + x * .6], (y * width + x) * 4);
      }
    }
    context.putImageData(data, 0, 0);
    const corners = [[.11, .12], [.87, .04], [.73, .91], [.19, .83]];
    const matrix = perspectiveMatrix(corners);
    const capture = engine => {
      const target = document.createElement('canvas');
      target.width = width;
      target.height = height;
      const output = target.getContext('2d');
      engine.drawRegion(output, { x: 0, y: 0, width, height });
      return output.getImageData(0, 0, width, height).data;
    };
    const diff = (a, b) => a.reduce((max, value, i) => Math.max(max, Math.abs(value - b[i])), 0);
    const normal = new PhotoEngine(document.createElement('canvas'));
    const packed = new PhotoEngine(document.createElement('canvas'));
    packed.maxSize = 256;
    Object.defineProperty(packed.gl, 'drawingBufferWidth', { get: () => 1 });
    try {
      for (const engine of [normal, packed]) {
        await engine.prepareImage(source);
        engine.setImage(source, { maxSize: Infinity });
      }
      normal.render({});
      const baseline = capture(normal);
      normal.render({}, -1, IDENTITY_CORNERS);
      const identity = diff(baseline, capture(normal));
      for (const engine of [normal, packed]) engine.render({}, -1, corners);
      const warped = capture(normal);
      const expectedErrors = [[12, 9], [128, 32], [240, 52]].map(([x, y]) => {
        const [u, v] = mapPerspective(matrix, [(x + .5) / width, (y + .5) / height]);
        const expected = [(u * width - .5) * .8, (v * height - .5) * 3, 150, 80 + (u * width - .5) * .6];
        return Math.max(...expected.map((channel, i) => Math.abs(channel - warped[(y * width + x) * 4 + i])));
      });
      const packing = diff(warped, capture(packed));
      const split = .49;
      normal.render({}, split, corners);
      const comparison = capture(normal);
      let splitError = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const reference = (x + .5) / width < split ? baseline : warped;
          for (let c = 0; c < 4; c++) {
            const i = (y * width + x) * 4 + c;
            splitError = Math.max(splitError, Math.abs(comparison[i] - reference[i]));
          }
        }
      }
      normal.render({}, -1);
      const reset = diff(baseline, capture(normal));
      const blob = await packed.exportBlob({}, 'image/png', corners);
      const bitmap = await createImageBitmap(blob);
      const output = document.createElement('canvas');
      output.width = bitmap.width;
      output.height = bitmap.height;
      const outputContext = output.getContext('2d');
      outputContext.drawImage(bitmap, 0, 0);
      const exported = diff(warped, outputContext.getImageData(0, 0, width, height).data);
      const dimensions = [bitmap.width, bitmap.height];
      bitmap.close();
      return { identity, reset, change: diff(baseline, warped), mapping: Math.max(...expectedErrors), packing, exported, splitError, dimensions };
    } finally {
      normal.dispose();
      packed.dispose();
    }
  });
  assert.equal(result.identity, 0);
  assert.equal(result.reset, 0);
  assert.ok(result.change > 20, JSON.stringify(result));
  assert.ok(result.mapping <= 4, JSON.stringify(result));
  assert.ok(result.packing <= 4, JSON.stringify(result));
  assert.ok(result.exported <= 4, JSON.stringify(result));
  assert.ok(result.splitError <= 1, JSON.stringify(result));
  assert.deepEqual(result.dimensions, [257, 65]);
  console.log(JSON.stringify(result));
  const transparentEdge = await page.evaluate(async () => {
    const { PhotoEngine } = await import('./src/engine.js');
    const source = document.createElement('canvas');
    source.width = source.height = 2;
    const context = source.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 1, 2);
    const engine = new PhotoEngine(document.createElement('canvas'));
    try {
      engine.setImage(source);
      engine.render({}, -1, [[.25, 0], [.75, 0], [.75, 1], [.25, 1]]);
      context.clearRect(0, 0, 2, 2);
      engine.drawRegion(context, { x: 0, y: 0, width: 2, height: 2 });
      return [...context.getImageData(0, 0, 2, 1).data];
    } finally {
      engine.dispose();
    }
  });
  for (const offset of [0, 4]) {
    const rgba = transparentEdge.slice(offset, offset + 4);
    assert.ok(rgba.slice(0, 3).every(channel => channel >= 253), JSON.stringify(transparentEdge));
    assert.ok(Math.abs(rgba[3] - (offset === 0 ? 191 : 64)) <= 1, JSON.stringify(transparentEdge));
  }
  console.log(JSON.stringify({ transparentEdge }));
  const longImages = await page.evaluate(async () => {
    const { PhotoEngine } = await import('./src/engine.js');
    const { perspectiveMatrix, mapPerspective } = await import('./src/public-perspective.js');
    const corners = [[.05, .08], [.96, .04], [.82, .93], [.11, .86]];
    const matrix = perspectiveMatrix(corners);
    const results = [];
    for (const portrait of [false, true]) {
      const engine = new PhotoEngine(document.createElement('canvas'));
      const long = Math.max(35000, engine.maxSize + 257), short = 48;
      const width = portrait ? short : long, height = portrait ? long : short;
      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      const context = source.getContext('2d');
      const pixels = context.createImageData(width, height);
      const wave = position => Math.round(124 + 87 * Math.sin((position - 1024) * .024));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const across = portrait ? x : y;
          pixels.data.set([wave(portrait ? y : x), 20 + across * 4, 135, 100 + across * 3], i);
        }
      }
      context.putImageData(pixels, 0, 0);
      const image = new Image();
      image.src = source.toDataURL('image/png');
      await image.decode();
      try {
        await engine.prepareImage(image);
        engine.setImage(image, { maxSize: Infinity });
        if (!engine.layout.packed) throw Error('实际超长图未使用图块纹理');
        engine.render({}, -1, corners);
        const x = portrait ? 24 : 0;
        const y = portrait ? 0 : 24;
        const region = { x, y, width: portrait ? 1 : long, height: portrait ? long : 1 };
        const capture = document.createElement('canvas');
        capture.width = region.width;
        capture.height = region.height;
        const ctx = capture.getContext('2d');
        engine.drawRegion(ctx, region);
        const view = ctx.getImageData(0, 0, region.width, region.height).data;
        const png = await createImageBitmap(await engine.exportBlob({}, 'image/png', corners));
        const dimensions = [png.width, png.height];
        ctx.clearRect(0, 0, capture.width, capture.height);
        ctx.drawImage(png, -x, -y);
        png.close();
        const exported = ctx.getImageData(0, 0, region.width, region.height).data;
        engine.render({});
        ctx.clearRect(0, 0, capture.width, capture.height);
        engine.drawRegion(ctx, region);
        const originalLine = ctx.getImageData(0, 0, region.width, region.height).data;
        const start = portrait ? [24/width, 1019/height] : [1019/width, 24/height];
        const end = portrait ? [24/width, 1026/height] : [1026/width, 24/height];
        const strokes = [{ radius: .1, points: [start, end] }];
        engine.render({}, -1, null, strokes);
        ctx.clearRect(0, 0, capture.width, capture.height);
        engine.drawRegion(ctx, region);
        const editedLine = ctx.getImageData(0, 0, region.width, region.height).data;
        const liquifyPng = await createImageBitmap(await engine.exportBlob({}, 'image/png', null, strokes));
        ctx.clearRect(0, 0, capture.width, capture.height);
        ctx.drawImage(liquifyPng, -x, -y);
        liquifyPng.close();
        const liquifyExport = ctx.getImageData(0, 0, region.width, region.height).data;
        const liquifyExportMatches = liquifyExport.every((value, i) => value === editedLine[i]);
        let moved = 0, outside = 0;
        for (let i = 0; i < long; i++) {
          const d = Math.abs(originalLine[i * 4] - editedLine[i * 4]);
          if (i >= 1014 && i <= 1031) moved = Math.max(moved, d);
          else outside = Math.max(outside, d);
        }
        let mapping = 0, seam = 0, exportError = 0, alpha = 0, worst;
        for (let i = 0; i < long; i++) {
          const px = portrait ? x : i, py = portrait ? i : y;
          const [u,v] = mapPerspective(matrix, [(px + .5) / width, (py + .5) / height]);
          const along = portrait ? v * height - .5 : u * width - .5;
          const across = portrait ? u * width - .5 : v * height - .5;
          const expected = [wave(along), 20 + across * 4, 135, 100 + across * 3];
          for (let c = 0; c < 4; c++) {
            const index = i * 4 + c;
            const error = Math.abs(view[index] - expected[c]);
            if (error > mapping) {
              mapping = error;
              worst = { i, c, actual: view[index], expected: expected[c], u, v };
            }
            if (i % 1024 <= 1 || i % 1024 >= 1022) seam = Math.max(seam, error);
            if (c === 3) alpha = Math.max(alpha, error);
            exportError = Math.max(exportError, Math.abs(view[index] - exported[index]));
          }
        }
        results.push({ portrait, width, height, dimensions, mapping, seam, exportError, alpha, worst, moved, outside, liquifyExportMatches });
      } finally {
        engine.dispose();
      }
    }
    return results;
  });
  for (const result of longImages) {
    assert.deepEqual(result.dimensions, [result.width, result.height]);
    assert.ok(result.mapping <= 5 && result.seam <= 5, JSON.stringify(result));
    assert.ok(result.exportError <= 3 && result.alpha <= 2, JSON.stringify(result));
    assert.ok(result.moved >= 5 && result.outside <= 2, JSON.stringify(result));
    assert.ok(result.liquifyExportMatches, JSON.stringify(result));
  }
  console.log(JSON.stringify(longImages));
  const liquify = await page.evaluate(async () => {
    const { PhotoEngine } = await import('./src/engine.js');
    const { sampleLiquify } = await import('./src/public-liquify.js');
    const { perspectiveMatrix, mapPerspective } = await import('./src/public-perspective.js');
    const width = 240, height = 180;
    const source = document.createElement('canvas');
    source.width = width; source.height = height;
    const ctx = source.getContext('2d'), data = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      data.data.set([x, y, 128, 255], (y * width + x) * 4);
    }
    ctx.putImageData(data, 0, 0);
    const strokes = [{ radius: .35, points: [[.42,.48],[.52,.51],[.56,.54]] }];
    const corners = [[.03,.05],[.9,.02],[.85,.94],[.03,.94]];
    const engine = new PhotoEngine(document.createElement('canvas'));
    const captured = document.createElement('canvas');
    captured.width = width; captured.height = height;
    const fresh = captured.getContext('2d');
    const capture = () => {
      fresh.clearRect(0, 0, width, height);
      engine.drawRegion(fresh, {x:0,y:0,width,height});
      return fresh.getImageData(0, 0, width, height).data;
    };
    const measure = (pixels, transform) => {
      let error = 0, changed = 0;
      for (let y = 2; y < height - 2; y += 3) for (let x = 2; x < width - 2; x += 3) {
        const uv = [(x+.5)/width,(y+.5)/height];
        const [u,v] = sampleLiquify(strokes, transform ? mapPerspective(transform, uv) : uv, width, height);
        const i = (y * width + x) * 4;
        error = Math.max(error, Math.abs(pixels[i] - (u*width-.5)), Math.abs(pixels[i+1] - (v*height-.5)));
        if (pixels[i] !== x || pixels[i+1] !== y) changed++;
      }
      return {error,changed};
    };
    try {
      engine.setImage(source);
      engine.render({}, -1, null, strokes);
      const direct = measure(capture(), null);
      const cached = engine.liquifyField;
      engine.render({}, -1, corners, strokes);
      const composed = capture();
      const combined = measure(composed, perspectiveMatrix(corners));
      const cachedAcrossCompare = cached === engine.liquifyField;
      const bitmap = await createImageBitmap(await engine.exportBlob({}, 'image/png', corners, strokes));
      const originalSize = bitmap.width === width && bitmap.height === height;
      fresh.clearRect(0, 0, width, height);
      fresh.drawImage(bitmap, 0, 0);
      bitmap.close();
      const exportMatches = fresh.getImageData(0, 0, width, height).data.every((value, i) => value === composed[i]);
      engine.render({}, -1, null, []);
      const reset = capture().every((value, i) => value === data.data[i]);
      return {direct,combined,cachedAcrossCompare,reset,originalSize,exportMatches};
    } finally {
      engine.dispose();
    }
  });
  assert.ok(liquify.direct.changed > 100 && liquify.direct.error <= 2, JSON.stringify(liquify));
  assert.ok(liquify.combined.error <= 2, JSON.stringify(liquify));
  assert.ok(liquify.cachedAcrossCompare && liquify.reset, JSON.stringify(liquify));
  assert.ok(liquify.originalSize && liquify.exportMatches, JSON.stringify(liquify));
  console.log(JSON.stringify({liquify}));
} finally {
  await app.evaluate(({ app }) => app.exit()).catch(() => {});
}
