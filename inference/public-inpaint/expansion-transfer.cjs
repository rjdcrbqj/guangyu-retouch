'use strict';

const { randomUUID } = require('node:crypto');
const { expansionSize } = require('./expansion-pixels.cjs');

const chunkSize = 1024 * 1024;

function pngLimit(width, height) {
  // 与工程边带的限制一致，包含 RGBA、逐行过滤字节和 PNG 包装开销。
  return Math.ceil((width * 4 + 1) * height * 1.02) + 128 * 1024;
}

function requireOwner(owner) {
  if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error('扩画布传输窗口无效');
}

function rectMatches(actual, expected) {
  return actual && ['left', 'top', 'width', 'height'].every(key => actual[key] === expected[key]);
}

function overlaps(a, b) {
  return a.left < b.left + b.width && b.left < a.left + a.width &&
    a.top < b.top + b.height && b.top < a.top + a.height;
}

function resultMetadata(result, { width, height, core }) {
  const generatedPixels = width * height - core.width * core.height;
  if (result?.width !== width || result.height !== height || !rectMatches(result.core, core) ||
      result.generatedPixels !== generatedPixels || !Number.isFinite(result.seconds) || result.seconds < 0 ||
      !Array.isArray(result.bands) || result.bands.length < 1 || result.bands.length > 4) {
    throw new Error('扩画布结果尺寸或边带无效');
  }
  const bands = [];
  let pixels = 0;
  for (const band of result.bands) {
    const { left, top, width: bandWidth, height: bandHeight, png } = band ?? {};
    if (![left, top, bandWidth, bandHeight].every(Number.isSafeInteger) ||
        left < 0 || top < 0 || bandWidth < 1 || bandHeight < 1 ||
        left + bandWidth > width || top + bandHeight > height || overlaps(band, core) ||
        bands.some(other => overlaps(band, other)) || !Buffer.isBuffer(png) || !png.length ||
        png.length > pngLimit(bandWidth, bandHeight)) throw new Error('扩画布边带数据无效');
    pixels += bandWidth * bandHeight;
    bands.push({ left, top, width: bandWidth, height: bandHeight, size: png.length });
  }
  if (pixels !== generatedPixels) throw new Error('扩画布边带区域不完整');
  return { width, height, core: { ...core }, generatedPixels, seconds: result.seconds, bands };
}

class ExpansionTransfer {
  #expand;
  #jobs = new Map();

  constructor({ expand }) {
    this.#expand = expand;
  }

  begin(owner, payload) {
    requireOwner(owner);
    if (this.#jobs.has(owner)) throw new Error('这个窗口已有正在处理的扩画布传输');
    const { size, width, height, margins } = payload ?? {};
    const layout = expansionSize(width, height, margins);
    if (!Number.isSafeInteger(size) || size <= 0 || size > pngLimit(width, height)) {
      throw new RangeError('扩画布输入的 PNG 大小无效');
    }
    const { left, top } = layout.core;
    const request = { width, height, margins: { left, top, right: layout.width - left - width, bottom: layout.height - top - height } };
    const id = randomUUID();
    this.#jobs.set(owner, { id, layout, request, input: Buffer.allocUnsafe(size), offset: 0, state: 'upload' });
    return { id, chunkSize };
  }

  #job(owner, id) {
    requireOwner(owner);
    const job = this.#jobs.get(owner);
    if (!job || job.id !== id) throw new Error('扩画布传输不存在或已失效');
    return job;
  }

  append(owner, payload) {
    const { id, offset, bytes } = payload ?? {};
    const job = this.#job(owner, id);
    if (job.state !== 'upload') throw new Error('扩画布输入已提交');
    if (offset !== job.offset) throw new RangeError('扩画布数据块的偏移或顺序无效');
    if (!(bytes instanceof Uint8Array)) throw new TypeError('扩画布数据块无效');
    if (bytes.length <= 0 || bytes.length > chunkSize || offset + bytes.length > job.input.length) {
      throw new RangeError('扩画布数据块长度无效');
    }
    job.input.set(bytes, offset);
    job.offset += bytes.length;
  }

  async finish(owner, payload) {
    const { id } = payload ?? {};
    const job = this.#job(owner, id);
    if (job.state !== 'upload') throw new Error('扩画布输入已提交');
    if (job.offset !== job.input.length) throw new Error('扩画布输入尚未传完');
    job.state = 'processing';
    try {
      const pending = this.#expand(job.input, job.request);
      job.input = null;
      const result = await pending;
      // 窗口关闭或重新加载后丢弃迟到的结果，即使同一个窗口已启动另一次任务。
      if (this.#jobs.get(owner) !== job) throw new Error('扩画布传输已取消');
      const metadata = resultMetadata(result, job.layout);
      job.bands = result.bands.map(band => band.png);
      job.state = 'ready';
      return metadata;
    } catch (error) {
      if (this.#jobs.get(owner) === job) this.#jobs.delete(owner);
      throw error;
    }
  }

  read(owner, payload) {
    const { id, band, offset } = payload ?? {};
    const job = this.#job(owner, id);
    if (job.state !== 'ready') throw new Error('扩画布结果尚未完成');
    if (!Number.isSafeInteger(band) || band < 0 || band >= job.bands.length) {
      throw new RangeError('扩画布边带编号无效');
    }
    const png = job.bands[band];
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= png.length) {
      throw new RangeError('扩画布边带数据块的偏移无效');
    }
    // IPC 只看到独立的小块缓冲区，不会复制该边带的整个底层内存。
    return Uint8Array.from(png.subarray(offset, offset + chunkSize));
  }

  end(owner, payload) {
    requireOwner(owner);
    const job = this.#jobs.get(owner);
    if (job && job.id === payload?.id) this.#jobs.delete(owner);
  }

  dropOwner(owner) {
    requireOwner(owner);
    this.#jobs.delete(owner);
  }
}

module.exports = { ExpansionTransfer };
