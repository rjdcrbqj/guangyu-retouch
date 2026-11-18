import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const prefix = 'guangyu-eye-size-render-';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await playwright._electron.launch({
    executablePath: path.join(root, 'runtime/electron.exe'),
    args: [process.env.GUANGYU_EYE_SIZE_APP_ROOT ?? root, '--user-data-dir=' + profile], env,
  });
  const page = await app.firstWindow();
  await page.locator('#hand.active').waitFor();
  const received = await page.evaluate(async () => {
    const { PhotoEngine } = await import('./src/engine.js');
    const { DEFAULTS } = await import('./src/model.js');
    const adjusted = { ...DEFAULTS, exposure: .2 };
    const width = 224, height = 110;
    const input = document.createElement('canvas');
    input.width = width;
    input.height = height;
    const inputContext = input.getContext('2d');
    const pattern = inputContext.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const shade = (x + 7 * y) % 11 < 5 ? 40 : 208;
      pattern.data.set([shade, 25 + x % 119, 31 + (y + x) % 144, x < 20 ? 5 : x < 63 ? 157 : 255], i);
    }
    inputContext.putImageData(pattern, 0, 0);
    const source = new Image();
    source.src = input.toDataURL();
    await source.decode();
    const eyes = [[
      { center: [55, 49], axis: [Math.cos(.28), Math.sin(.28)], radii: [34, 20] },
      { center: [163, 57], axis: [Math.cos(.34), -Math.sin(.34)], radii: [37, 21] },
    ]];
    const state = { strength: 100, sourceWH: [width, height], faces: eyes };
    const resultCanvas = document.createElement('canvas');
    const engine = new PhotoEngine(resultCanvas);
    const output = (params, split, perspective, liquify) => {
      engine.render(params, split, perspective, liquify);
      const data = resultCanvas.getContext('webgl').getContextAttributes();
      if (!data) throw new Error('WebGL is unavailable');
      const gl = engine.gl;
      const bytes = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return bytes;
    };
    const readTopOrigin = (bytes, x, y) =>
      bytes.subarray(((height - y - 1) * width + x) * 4, ((height - y - 1) * width + x) * 4 + 4);
    const differentPixels = (a, b) => {
      let changes = 0;
      for (let i = 0; i < a.length; i += 4) if (a.subarray(i, i + 4).some((value, c) => value !== b[i + c])) changes++;
      return changes;
    };
    const rect = [[.03,.02],[.96,.04],[.96,.97],[.04,.97]];
    const liquify = [{ radius: .17, points: [[.23,.44],[.25,.46]] }];
    try {
      engine.setImage(source, { maxSize: Infinity });
      const original = output(DEFAULTS, 1), neutral = output(adjusted, -1), otherBaseline = output(adjusted, -1, rect, liquify);
      // 第五个几何参数独立于手动液化，方便使用同一输出接口。
      engine.setEyeSize(state);
      const modified = output(adjusted, -1), compared = output(adjusted, 1);
      const otherEdited = output(adjusted, -1, rect, liquify);
      const changes = differentPixels(neutral, modified);
      let outsideMaxDifference = 0, insideAlphaChanges = 0, closeToCpu = 0, sampleError = 0;
      const { sampleEyeSize } = await import('./src/public-eye-size.js');
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const px = x + .5, py = y + .5, initial = readTopOrigin(neutral, x, y), final = readTopOrigin(modified, x, y);
        const inside = eyes[0].some(({center:[cx,cy],axis:[dx,dy],radii:[rx,ry]}) =>
          (((px-cx)*dx+(py-cy)*dy)/rx)**2+((-(px-cx)*dy+(py-cy)*dx)/ry)**2<1);
        if (!inside) outsideMaxDifference = Math.max(outsideMaxDifference, ...initial.map((v,c)=>Math.abs(v-final[c])));
        else {
          if (initial[3] !== final[3]) insideAlphaChanges++;
          if (initial[3] !== 255 || Math.abs(px - 63) < 10) continue;
          const [u, v] = sampleEyeSize(state, [px/width,py/height]);
          const sx = u*width-.5, sy = v*height-.5, x0 = Math.floor(sx), y0 = Math.floor(sy);
          const xx = sx-x0, yy = sy-y0;
          const pixels = [[x0,y0],[x0+1,y0],[x0,y0+1],[x0+1,y0+1]].map(([a,b])=>readTopOrigin(neutral,a,b));
          for (let channel=0;channel<3;channel++) {
            const reference = (pixels[0][channel]*(1-xx)+pixels[1][channel]*xx)*(1-yy)+(pixels[2][channel]*(1-xx)+pixels[3][channel]*xx)*yy;
            sampleError = Math.max(sampleError, Math.abs(final[channel]-reference));
          }
          closeToCpu++;
        }
      }
      const editedBlob = await engine.exportBlob(adjusted, 'image/png');
      const raster = document.createElement('canvas');
      raster.width = width;
      raster.height = height;
      const rasterCtx = raster.getContext('2d'), bitmap = await createImageBitmap(editedBlob);
      rasterCtx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blobBytes = rasterCtx.getImageData(0,0,width,height).data;
      let exportedError = 0;
      for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
        const correct = readTopOrigin(modified,x,y);
        for (let c=correct[3] < 20 ? 3 : 0;c<4;c++) exportedError = Math.max(exportedError,Math.abs(correct[c]-blobBytes[(y*width+x)*4+c]));
      }
      engine.setEyeSize(null);
      const reset = output(adjusted, -1);
      return { changes, outsideMaxDifference, insideAlphaChanges, closeToCpu, sampleError, exportedError, resetChanges: differentPixels(neutral,reset),
        comparisonDifferences: differentPixels(original,compared), combinedChanges: differentPixels(otherBaseline,otherEdited) };
    } finally { engine.dispose(); }
  });
  assert.ok(received.changes > 1000, JSON.stringify(received));
  assert.ok(received.outsideMaxDifference <= 1, JSON.stringify(received));
  assert.ok(received.insideAlphaChanges > 8, JSON.stringify(received));
  assert.ok(received.closeToCpu > 1500 && received.sampleError <= 3, JSON.stringify(received));
  assert.ok(received.exportedError <= 2, JSON.stringify(received));
  assert.equal(received.resetChanges, 0);
  assert.equal(received.comparisonDifferences, 0);
  assert.ok(received.combinedChanges > 1000);
  console.log(JSON.stringify(received));
} finally {
  try { await app?.close(); }
  finally {
    const resolved = await fs.realpath(profile);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith(prefix));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
