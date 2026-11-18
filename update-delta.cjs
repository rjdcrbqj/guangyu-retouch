'use strict';

const { createHash } = require('node:crypto');
const { constants } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const MAX_INVENTORY_BYTES = 4 * 1024 ** 2;
const MAX_ENTRIES = 20_000;
const MAX_FILE_BYTES = 2 * 1024 ** 3;
const MAX_PAYLOAD_BYTES = 8 * 1024 ** 3;
const MARKER_PATH = '.guangyu-trial';
const PACKAGE_PATH = 'resources/app/package.json';
const VERSION = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/;
const FORBIDDEN_SEGMENT = /[<>:"\\|?*\u0000-\u001f\ud800-\udfff]/u;
const RESERVED_SEGMENT = /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³])$/i;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digestString = value => typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/i.test(value);

function versionParts(value) {
  const match = typeof value === 'string' && VERSION.exec(value);
  if (!match || match[0] !== value) throw new Error('增量更新版本格式无效。');
  return match.slice(1).map(Number);
}

function requireUpgrade(base, target) {
  const oldVersion = versionParts(base), newVersion = versionParts(target);
  const mismatch = newVersion.findIndex((part, index) => part !== oldVersion[index]);
  if (mismatch === -1 || newVersion[mismatch] < oldVersion[mismatch]) throw new Error('增量目标版本必须高于基线版本。');
}

function resolveIncrementalMetadata(value, { currentVersion, targetVersion, fullSize } = {}) {
  if (value == null) return null;
  requireUpgrade(currentVersion, targetVersion);
  if (!record(value) || value.format !== 1 ||
      value.baseVersion !== currentVersion || value.targetVersion !== targetVersion ||
      !Number.isSafeInteger(fullSize) || fullSize >= MAX_FILE_BYTES ||
      !Number.isSafeInteger(value.size) || value.size <= 0 || value.size >= fullSize ||
      value.installer !== `GuangyuRetouchUpdate-${currentVersion}-to-${targetVersion}.exe` ||
      !digestString(value.sha256) || !digestString(value.inventorySha256)) {
    throw new Error('可选增量安装包信息无效或与当前版本不匹配。');
  }
  const { format, baseVersion, installer, size, sha256, inventorySha256 } = value;
  return { format, baseVersion, targetVersion, installer, size,
           sha256: sha256.toLowerCase(), inventorySha256: inventorySha256.toLowerCase() };
}

function readJson(bytes, description) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) { throw new Error(`${description}格式无效。`, { cause: error }); }
}

function segmentsFor(relative) {
  if (typeof relative !== 'string' || relative.length === 0 || relative.length > 512) {
    throw new Error('增量文件的相对路径无效。');
  }
  const segments = relative.split('/');
  for (const name of segments) {
    const stem = name.split('.', 1)[0].replace(/ +$/, '');
    if (!name || name.length > 255 || /[. ]$/.test(name) ||
        FORBIDDEN_SEGMENT.test(name) || RESERVED_SEGMENT.test(stem)) {
      throw new Error(`增量文件的相对路径无效：${relative}`);
    }
  }
  return segments;
}

function validateInventory(manifest, metadata) {
  const { format, baseVersion, targetVersion, files } = manifest ?? {};
  if (format !== 1 || baseVersion !== metadata.baseVersion || targetVersion !== metadata.targetVersion ||
      !Array.isArray(files) || files.length < 2 || files.length > MAX_ENTRIES) {
    throw new Error('增量文件清单版本或条目数无效。');
  }
  const paths = new Map();
  const entries = [];
  let byteCount = 0;
  let marker, packageEntry;
  for (const entry of files) {
    if (!record(entry) || !['base', 'changed'].includes(entry.source) || !digestString(entry.sha256) ||
        entry.sha256 !== entry.sha256.toLowerCase() ||
        !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size >= MAX_FILE_BYTES) {
      throw new Error('增量文件清单条目无效。');
    }
    const segments = segmentsFor(entry.path);
    byteCount += entry.size;
    if (byteCount > MAX_PAYLOAD_BYTES) throw new Error('增量文件清单总大小超出允许范围。');

    let prefix = '';
    for (const [index, segment] of segments.entries()) {
      prefix += (index === 0 ? '' : '/') + segment;
      // 除大小写外也检查目录层级，避免 A/x 与 a/y 或同名文件、目录混入同一 Windows 树。
      const key = prefix.toUpperCase().toLowerCase();
      const existing = paths.get(key);
      const leaf = index === segments.length - 1;
      if (existing && (existing.prefix !== prefix || existing.leaf || leaf)) {
        throw new Error(`增量文件清单中的路径或层级冲突：${entry.path}`);
      }
      if (!existing) {
        paths.set(key, { prefix, leaf });
        if (paths.size > MAX_ENTRIES) throw new Error('增量文件和目录数量超出允许范围。');
      }
    }

    const checked = { ...entry, segments };
    entries.push(checked);
    if (entry.path === MARKER_PATH) marker = checked;
    if (entry.path === PACKAGE_PATH) packageEntry = checked;
  }
  if (!marker || packageEntry?.source !== 'changed') throw new Error('增量文件清单缺少应用安装标记或新版记录。');
  return entries;
}

async function checkedFile(root, segments, signal) {
  let file = root, info;
  const name = segments.join('/');
  try {
    for (const [index, segment] of segments.entries()) {
      signal?.throwIfAborted();
      file = path.join(file, segment);
      info = await fs.lstat(file);
      if (info.isSymbolicLink()) throw new Error('不支持链接或重解析路径。');
      if (index === segments.length - 1 ? !info.isFile() : !info.isDirectory()) {
        throw new Error('文件或目录类型不匹配。');
      }
    }
    const resolved = await fs.realpath(file);
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith('..' + path.sep) ||
        path.isAbsolute(relative) || path.relative(file, resolved) !== '') {
      throw new Error('文件实际路径超出安装目录或经过重解析。');
    }
    return { file: resolved, info };
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(`增量基线文件路径无效：${name}。${error.message}`, { cause: error });
  }
}

// 通过已打开的文件描述符流式读取，并对读取期间的长度和身份再次核验。
async function readLocalFile(root, segments, { signal, size, limit, contents = false }) {
  const { file, info } = await checkedFile(root, segments, signal);
  const name = segments.join('/');
  if (info.size > limit || (size !== undefined && info.size !== size)) {
    throw new Error(`增量基线文件大小不匹配：${name}`);
  }
  signal?.throwIfAborted();
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.dev !== info.dev || actual.ino !== info.ino || actual.size !== info.size) {
      throw new Error(`校验前基线文件已变化：${name}`);
    }
    const chunks = contents ? [] : null;
    const hash = contents ? null : createHash('sha256');
    let read = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 256 * 1024, signal })) {
      signal?.throwIfAborted();
      read += chunk.length;
      if (read > info.size) throw new Error(`校验期间基线文件大小已变化：${name}`);
      if (contents) chunks.push(chunk);
      else hash.update(chunk);
    }
    const after = await handle.stat();
    if (read !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs) {
      throw new Error(`校验期间基线文件已变化：${name}`);
    }
    return contents ? Buffer.concat(chunks, read) : hash.digest('hex');
  } finally {
    await handle.close();
  }
}

async function verifyDeltaInventory(bytes, metadata, installDir, { signal } = {}) {
  try {
    signal?.throwIfAborted();
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_INVENTORY_BYTES) {
      throw new Error('增量文件清单长度超出允许范围。');
    }
    if (!record(metadata) || metadata.format !== 1 || !digestString(metadata.inventorySha256)) {
      throw new Error('增量文件清单摘要无效。');
    }
    requireUpgrade(metadata.baseVersion, metadata.targetVersion);
    const raw = Buffer.from(bytes);
    if (createHash('sha256').update(raw).digest('hex') !== metadata.inventorySha256.toLowerCase()) {
      throw new Error('增量文件清单完整性校验失败。');
    }
    const entries = validateInventory(readJson(raw, '增量文件清单'), metadata);
    if (typeof installDir !== 'string' || installDir.length === 0) throw new Error('安装目录无效。');
    const requested = path.resolve(installDir);
    const rootInfo = await fs.lstat(requested);
    const root = await fs.realpath(requested);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || path.relative(requested, root) !== '') {
      throw new Error('安装目录无效或经过链接。');
    }

    const marker = await readLocalFile(root, [MARKER_PATH], { signal, limit: 64, contents: true });
    if (marker.toString('utf8').trim() !== 'guangyu-retouch-trial') throw new Error('已安装应用的产品标记无效。');
    const packageBytes = await readLocalFile(root, PACKAGE_PATH.split('/'), { signal, limit: 1024 ** 2, contents: true });
    const installed = readJson(packageBytes, '已安装应用的版本记录');
    if (!record(installed) || installed.name !== 'guangyu-retouch' || installed.version !== metadata.baseVersion) {
      throw new Error('已安装应用的版本与增量基线不符。');
    }

    for (const entry of entries) {
      signal?.throwIfAborted();
      if (entry.source !== 'base') continue;
      const digest = await readLocalFile(root, entry.segments, { signal, size: entry.size, limit: entry.size });
      if (digest !== entry.sha256) throw new Error(`增量基线文件完整性校验失败：${entry.path}`);
    }
    signal?.throwIfAborted();
    return true;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  }
}

module.exports = { resolveIncrementalMetadata, verifyDeltaInventory };
