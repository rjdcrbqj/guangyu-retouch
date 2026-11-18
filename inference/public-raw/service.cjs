'use strict';

const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const maxRawBytes = 60 * 1024 * 1024;
const maxImageUrl = 85 * 1024 * 1024;
const maxPixels = 80_000_000;
const timeout = 90_000;
const prefix = 'guangyu-raw-';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const rawFormats = new Set(['dng', 'cr2', 'crw']);
const whiteBalances = new Map([['camera', ['-w']], ['auto', ['-a']], ['daylight', []]]);
const native = path.join(__dirname, 'native');
const decoder = path.join(native, 'dcraw_emu.exe');
// 0.22.3 official MSVC x64 release. The DLL is loaded beside the verified EXE.
const nativeHashes = {
  'dcraw_emu.exe': '86f27d677339a440aba61d5de793a21e2e4fa2dde9c3edc8306d20bac5ace2c9',
  'libraw.dll': '2c4df36d9011267fd3ffd5c23e80d69d5f42c3d503f03ac02448f5c8a7fe0fa2',
};

function validateRawRecipe(recipe) {
  const { exposure, whiteBalance } = recipe ?? {};
  if (typeof recipe !== 'object' || !recipe || Array.isArray(recipe) ||
      !Number.isFinite(exposure) || exposure < -3 || exposure > 3 || !whiteBalances.has(whiteBalance)) {
    throw new Error('RAW 显影设置无效。');
  }
  return { exposure: exposure === 0 ? 0 : exposure, whiteBalance };
}

function rawBytes(raw) {
  if (typeof raw !== 'string' || !raw.length || raw.length % 4 ||
      raw.length > 4 * Math.ceil(maxRawBytes / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new Error('RAW 文件数据无效或超过 60 MB。');
  }
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0;
  if (raw.length / 4 * 3 - padding > maxRawBytes ||
      (padding && (alphabet.indexOf(raw.at(-padding - 1)) & (padding === 2 ? 15 : 3)))) {
    throw new Error('RAW 文件数据无效或超过 60 MB。');
  }
  return Buffer.from(raw, 'base64');
}

function matchesFormat(bytes, format) {
  if (bytes.length < 14) return false;
  if (format === 'crw') {
    return /^(II|MM)$/.test(bytes.toString('ascii', 0, 2)) &&
      bytes.toString('ascii', 6, 14) === 'HEAPCCDR';
  }
  const magic = bytes.readUInt32BE(0);
  const little = magic === 0x49492a00;
  if (!little && magic !== 0x4d4d002a) return false;
  if (format === 'cr2') return bytes.readUInt32BE(8) === 0x43520200;

  // DNGVersion in TIFF IFD0 distinguishes a DNG from a renamed TIFF or NEF.
  const countAt = little ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4);
  if (countAt < 8 || countAt + 2 > bytes.length) return false;
  const read16 = little ? offset => bytes.readUInt16LE(offset) : offset => bytes.readUInt16BE(offset);
  const read32 = little ? offset => bytes.readUInt32LE(offset) : offset => bytes.readUInt32BE(offset);
  const count = read16(countAt), entries = countAt + 2;
  if (entries + count * 12 + 4 > bytes.length) return false;
  for (let index = 0; index < count; index++) {
    const offset = entries + index * 12;
    if (read16(offset) === 50706) {
      return read16(offset + 2) === 1 && read32(offset + 4) === 4 && bytes[offset + 8] > 0;
    }
  }
  return false;
}

async function verifyRuntime() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('RAW 显影需要 Windows 64 位版本。');
  }
  try {
    await Promise.all(Object.entries(nativeHashes).map(async ([file, expected]) => {
      const location = path.join(native, file);
      const stat = await fs.lstat(location);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024 ||
          createHash('sha256').update(await fs.readFile(location)).digest('hex') !== expected) {
        throw Error('unexpected decoder binary');
      }
    }));
  } catch (cause) {
    throw new Error('RAW 显影组件不完整或校验失败。', { cause });
  }
}

function runDecoder(args, cwd, signal) {
  const windows = process.env.SystemRoot || 'C:\\Windows';
  const env = {
    SystemRoot: windows,
    WINDIR: windows,
    PATH: [path.dirname(process.execPath), path.join(windows, 'System32')].join(path.delimiter),
    TEMP: cwd,
    TMP: cwd,
  };
  return new Promise((resolve, reject) => {
    let result;
    const child = execFile(decoder, args, {
      windowsHide: true, cwd, env, signal, timeout, maxBuffer: 64 * 1024,
    }, (error, stdout, stderr) => { result = { error, stdout, stderr }; });
    child.once('close', () => {
      if (signal?.aborted) {
        reject(signal.reason);
      } else if (result.error) {
        const message = result.error.killed ? 'RAW 显影超时，请重试。' : 'RAW 文件无法显影，文件可能损坏或相机格式暂不支持。';
        reject(new Error(message, { cause: result.error }));
      } else if (!result.stdout.includes('LibRaw::unpack()') ||
                 !result.stdout.includes('LibRaw::dcraw_process()') || result.stderr.includes('Cannot ')) {
        reject(new Error('RAW 文件未完成传感器解包或显影。'));
      } else {
        resolve();
      }
    });
  });
}

function rasterPath(tiff, preview) {
  let image = sharp(tiff, { limitInputPixels: maxPixels, failOn: 'error' })
    .withIccProfile('srgb').timeout({ seconds: 60 });
  if (preview) image = image.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
  return image;
}

async function encodeRaster(tiff, directory, preview, signal) {
  const meta = await sharp(tiff, { limitInputPixels: maxPixels, failOn: 'error' }).metadata();
  if (meta.format !== 'tiff' || meta.depth !== 'ushort' || meta.bitsPerSample !== 16 || meta.channels !== 3 ||
      !meta.icc?.length || meta.width < 2 || meta.height < 2 ||
      meta.width > 32766 || meta.height > 32766 || meta.width * meta.height > maxPixels) {
    throw new Error('RAW 显影结果的尺寸或像素格式无效。');
  }
  const variants = [
    { extension: 'png', mime: 'png', encode: image => image.png({ compressionLevel: 4 }) },
    ...[95, 88, 80].map(quality => ({
      extension: 'jpg', mime: 'jpeg', encode: image => image.jpeg({ quality, chromaSubsampling: '4:4:4' }),
    })),
  ];
  for (const variant of variants) {
    signal?.throwIfAborted();
    const imagePath = path.join(directory, 'editable.' + variant.extension);
    const imagePrefix = 'data:image/' + variant.mime + ';base64,';
    const { width, height, size } = await variant.encode(rasterPath(tiff, preview)).toFile(imagePath);
    signal?.throwIfAborted();
    // Keep developed rasters within the same bound used by existing photo IPC.
    if (imagePrefix.length + 4 * Math.ceil(size / 3) <= maxImageUrl) {
      const bytes = await fs.readFile(imagePath, { signal });
      return { image: imagePrefix + bytes.toString('base64'), width, height };
    }
    await fs.unlink(imagePath);
  }
  throw new Error('RAW 显影后的照片过大，无法载入工作台。');
}

async function developRaw({ raw, format, recipe, preview = false } = {}, { signal } = {}) {
  signal?.throwIfAborted();
  if (!rawFormats.has(format) || typeof preview !== 'boolean') throw new Error('RAW 文件格式或请求无效。');
  const { exposure, whiteBalance } = validateRawRecipe(recipe);
  const bytes = rawBytes(raw);
  if (!matchesFormat(bytes, format)) throw new Error('RAW 文件内容与所选格式不一致。');
  await verifyRuntime();
  signal?.throwIfAborted();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const temp = await fs.realpath(os.tmpdir());
  const working = await fs.mkdtemp(path.join(temp, prefix));
  try {
    const filename = 'source.' + format, converted = 'developed.tiff';
    await fs.writeFile(path.join(working, filename), bytes, { flag: 'wx', signal });
    // -4 writes linear 16-bit RGB with no auto brightening. -b scales it before
    // the output transfer curve; LibRaw's -aexpo would clamp -3 EV to -2 EV.
    await runDecoder(['-v', '-timing', '-q', '3', '-o', '1', '-4', '-b', String(2 ** exposure),
      '-T', ...(preview ? ['-h'] : []), ...whiteBalances.get(whiteBalance),
      '-Z', converted, filename], working, signal);
    const output = await encodeRaster(path.join(working, converted), working, preview, signal);
    signal?.throwIfAborted();
    return { ...output, sha256 };
  } finally {
    // Wait for native decode and Sharp to close their handles before cleanup.
    const actual = await fs.realpath(working);
    if (actual !== working || path.dirname(actual) !== temp || !path.basename(actual).startsWith(prefix)) {
      throw new Error('RAW 临时目录校验失败。');
    }
    await fs.rm(actual, { recursive: true, force: true, maxRetries: 4 });
  }
}

module.exports = { validateRawRecipe, developRaw };

