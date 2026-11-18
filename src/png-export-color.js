// PNG signature (8), the complete IHDR chunk (25), then the next chunk header.
const afterIhdr = 33;
const chunkHeaderSize = 8;
const chunkOverhead = chunkHeaderSize + 4;
const pngSignature = 0x89504e470d0a1a0an;
const colorChunks = new Set(['sRGB', 'iCCP', 'cICP', 'gAMA', 'cHRM']);
const srgbChunks = new Uint8Array([
  // gAMA 45455 and sRGB intent 0 (perceptual), with their PNG chunk CRCs.
  0, 0, 0, 4, 0x67, 0x41, 0x4d, 0x41, 0, 0, 0xb1, 0x8f, 0x0b, 0xfc, 0x61, 0x05,
  0, 0, 0, 1, 0x73, 0x52, 0x47, 0x42, 0, 0xae, 0xce, 0x1c, 0xe9,
]);

function chunkType(view, offset) {
  return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, 4));
}

// Only final workbench exports reach this function. Their samples are already sRGB.
export async function tagSrgbPng(png) {
  const prefix = new DataView(await png.slice(0, afterIhdr + chunkHeaderSize).arrayBuffer());
  const invalid = 'PNG 导出文件格式无效。';
  if (prefix.byteLength !== afterIhdr + chunkHeaderSize || prefix.getBigUint64(0) !== pngSignature ||
      prefix.getUint32(8) !== 13 || chunkType(prefix, 12) !== 'IHDR') {
    throw new Error(invalid);
  }

  let offset = afterIhdr;
  let header = new DataView(prefix.buffer, offset);
  while (offset + chunkOverhead <= png.size) {
    const next = offset + chunkOverhead + header.getUint32(0);
    if (next > png.size) break;
    const type = chunkType(header, 4);
    if (colorChunks.has(type)) return png;
    if (type === 'IDAT') {
      return new Blob([png.slice(0, afterIhdr), srgbChunks, png.slice(afterIhdr)], { type: 'image/png' });
    }
    if (type === 'IEND') break;
    // Skip the payload and CRC. Color chunks are before the first IDAT.
    offset = next;
    if (offset + chunkOverhead > png.size) break;
    header = new DataView(await png.slice(offset, offset + chunkHeaderSize).arrayBuffer());
  }

  throw new Error(invalid);
}
