'use strict';
const zlib = require('node:zlib');
const POLICY = 'encoded-gray8-no-metadata-transform';
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const ANCILLARY = new Set(['eXIf', 'iTXt']);
const COLOR_TRANSFORMS = new Set(['gAMA', 'iCCP', 'sRGB', 'cHRM']);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let c = value;
  for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  return c >>> 0;
});
function crc(data, begin, end) {
  let c = 0xffffffff;
  for (let i = begin; i < end; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ data[i]) & 255];
  return (c ^ 0xffffffff) >>> 0;
}
function uint32(data, offset) {
  return data[offset] * 16777216 + data[offset + 1] * 65536 + data[offset + 2] * 256 + data[offset + 3];
}
function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const a = Math.abs(estimate - left), b = Math.abs(estimate - up), c = Math.abs(estimate - upperLeft);
  return a <= b && a <= c ? left : b <= c ? up : upperLeft;
}

// 解的是编码中的GRAY8像素；metadata保持未解析，不自动声称原NativePhoto结果。
function decodeSuppliedGrayPNG(request) {
  if (!request || request.policy !== POLICY || !(request.data instanceof Uint8Array)) {
    throw new TypeError('灰PNG需要BYTE供给与显式encoded-gray8-no-metadata-transform');
  }
  const input = request.data;
  if (input.length < 8 || SIGNATURE.some((byte, i) => input[i] !== byte)) throw new TypeError('灰PNG signature无效');
  const chunkTypes = [], ancillaryChunkTypes = [], idats = [];
  let position = 8, width, height, seenIDAT = false, closedIDAT = false, ended = false;
  while (position < input.length) {
    if (input.length - position < 12) throw new RangeError('灰PNG chunk头被截断');
    const length = uint32(input, position), end = position + 12 + length;
    if (end > input.length) throw new RangeError('灰PNG chunk数据被截断');
    const type = String.fromCharCode(...input.subarray(position + 4, position + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || (type.charCodeAt(2) & 32)) throw new TypeError('灰PNG chunk类型无效');
    if (crc(input, position + 4, position + 8 + length) !== uint32(input, position + 8 + length)) {
      throw new TypeError('灰PNG chunk CRC无效');
    }
    if (chunkTypes.length === 0 && type !== 'IHDR') throw new TypeError('灰PNG需要首IHDR');
    if (type === 'IHDR') {
      if (chunkTypes.length !== 0 || length !== 13) throw new TypeError('灰PNG IHDR重复或长度无效');
      const begin = position + 8;
      width = uint32(input, begin); height = uint32(input, begin + 4);
      if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16000000) {
        throw new RangeError('灰PNG WH超出1..4096/16MP');
      }
      if (input[begin + 8] !== 8 || input[begin + 9] !== 0 || input[begin + 10] !== 0 || input[begin + 11] !== 0 || input[begin + 12] !== 0) {
        throw new TypeError('灰PNG仅支持gray8、标准compression/filter及noninterlace');
      }
    } else if (type === 'IDAT') {
      if (closedIDAT) throw new TypeError('灰PNG IDAT必须连续');
      seenIDAT = true;
      idats.push(Buffer.from(input.buffer, input.byteOffset + position + 8, length));
    } else if (type === 'IEND') {
      if (length !== 0 || !seenIDAT || end !== input.length) throw new TypeError('灰PNG IEND/IDAT或文件尾无效');
      ended = true;
    } else {
      if (COLOR_TRANSFORMS.has(type)) throw new TypeError('灰PNG颜色变换metadata不在本供给范围');
      if (!ANCILLARY.has(type)) throw new TypeError('灰PNG chunk不在eXIf/iTXt白名单');
      ancillaryChunkTypes.push(type);
      if (seenIDAT) closedIDAT = true;
    }
    chunkTypes.push(type); position = end;
    if (ended) break;
  }
  if (!ended) throw new TypeError('灰PNG缺少IEND');
  const compressed = Buffer.concat(idats), expected = height * (width + 1);
  const inflated = zlib.inflateSync(compressed, { maxOutputLength: expected + 1, info: true });
  if (inflated.buffer.length !== expected || inflated.engine.bytesWritten !== compressed.length) {
    throw new RangeError('灰PNG zlib输出长度或压缩尾部无效');
  }
  const filtered = inflated.buffer, output = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const encoded = y * (width + 1), filter = filtered[encoded];
    if (filter > 4) throw new TypeError('灰PNG filter超出0..4');
    for (let x = 0; x < width; x++) {
      const at = y * width + x, left = x ? output[at - 1] : 0, up = y ? output[at - width] : 0;
      const upperLeft = x && y ? output[at - width - 1] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
      output[at] = (filtered[encoded + 1 + x] + prediction) & 255;
    }
  }
  return { data: output, width, height, stride: width,
    metadata: { chunkTypes, ancillaryChunkTypes, orientation: null, orientationParsed: false, transformApplied: false } };
}

module.exports = { decodeSuppliedGrayPNG };
