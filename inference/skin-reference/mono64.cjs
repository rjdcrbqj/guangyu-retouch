'use strict';

// 原code2放大端点的16位整数步长；只用于源维度2..63。
function endpointPlan(size) {
  const step = Math.floor((size * 65536 - 65537) / 63);
  return Array.from({ length: 64 }, (_, i) => {
    const position = i * step;
    return { index: position >> 16, weight7: (position >> 9) & 127, weight8: (position >> 8) & 255 };
  });
}

// 仅处理已明确供给的mono BYTE ROI，按原code2的标量整数定义输出独立64平方mask。
function resizeReferenceMono64(request) {
  if (request === null || typeof request !== 'object') throw new TypeError('mono64需要明确的供给参数');
  const { data, width, height, stride, math } = request;
  if (![width, height].every(v => Number.isInteger(v) && v >= 1 && v <= 64)) {
    throw new RangeError('mono64源尺寸必须为整数1..64');
  }
  if (!(data instanceof Uint8Array) || math !== 'native-code2-scalar') {
    throw new TypeError('mono64需要BYTE1与显式native-code2-scalar数学');
  }
  const span = (height - 1) * stride + width;
  if (!Number.isSafeInteger(stride) || stride < width || !Number.isSafeInteger(span) || data.length < span) {
    throw new RangeError('mono64 stride或最后有效行范围无效');
  }
  const output = new Uint8Array(4096);
  const result = () => ({ data: output, width: 64, height: 64, stride: 64 });

  if (width === 64 && height === 64) {
    for (let y = 0; y < 64; y++) output.set(data.subarray(y * stride, y * stride + 64), y * 64);
    return result(); // 独立私有BYTE复制，不执行原protected copy或CPU分派。
  }
  if (width === 1) {
    for (let y = 0; y < 64; y++) {
      const sourceY = (height * 512 + y * height * 1024) >> 16;
      output.fill(data[sourceY * stride], y * 64, (y + 1) * 64);
    }
    return result(); // effective0只读取一个BYTE，source1没有第二邻居。
  }
  if (width === 64) {
    const maximumY = Math.max(0, height * 65536 - 65537);
    for (let y = 0; y < 64; y++) {
      const position = Math.min(y * height * 1024, maximumY);
      const sourceY = position >> 16, weight = (position >> 8) & 255;
      const first = sourceY * stride;
      if (weight === 0) {
        output.set(data.subarray(first, first + 64), y * 64);
      } else {
        const second = first + stride;
        for (let x = 0; x < 64; x++) {
          output[y * 64 + x] = (data[first + x] * (256 - weight) + data[second + x] * weight + 128) >> 8;
        }
      }
    }
    return result(); // row-only起点0和H*1024，不能套一般放大端点步长。
  }

  const xPlan = endpointPlan(width);
  const horizontal = new Uint8Array(height * 64);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < 64; x++) {
      const { index, weight7 } = xPlan[x], first = y * stride + index;
      horizontal[y * 64 + x] = (data[first] * (128 - weight7) + data[first + 1] * weight7 + 64) >> 7;
    }
  }
  if (height === 64) {
    output.set(horizontal);
  } else if (height === 1) {
    for (let y = 0; y < 64; y++) output.set(horizontal, y * 64);
  } else {
    const yPlan = endpointPlan(height);
    for (let y = 0; y < 64; y++) {
      const { index, weight8 } = yPlan[y];
      for (let x = 0; x < 64; x++) {
        const first = index * 64 + x;
        output[y * 64 + x] = (horizontal[first] * (256 - weight8) + horizontal[first + 64] * weight8 + 128) >> 8;
      }
    }
  }
  return result(); // H已写入BYTE，再做V整数舍入；不能融合两阶段。
}

module.exports = { resizeReferenceMono64 };
