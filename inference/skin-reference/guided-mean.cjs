'use strict';
const f = Math.fround;

function finiteF32(value) {
  const rounded = f(value);
  if (!Number.isFinite(rounded)) throw RangeError('guided mean requires finite F32 intermediates');
  return rounded;
}

// border2: reflection repeats the endpoint, including kernels larger than the image.
function borderMap(size, radius) {
  return Int32Array.from({length: size + 2 * radius}, (_, j) => {
    let i = j - radius;
    while (i < 0 || i >= size) i = i < 0 ? -i - 1 : 2 * size - i - 1;
    return i;
  });
}

function guidedMean({data, width, height, radius, depth} = {}) {
  if (!Number.isInteger(width) || width < 5 || width > 1500 ||
      !Number.isInteger(height) || height < 5 || height > 1500)
    throw RangeError('guided mean dimensions must be integers in 5..1500');
  if (!Number.isInteger(radius) || radius < 1 || radius > 15)
    throw RangeError('guided mean radius must be an integer in 1..15');
  const Input = depth === 0 ? Uint8Array : depth === 2 ? Uint16Array : depth === 5 ? Float32Array : null;
  if (!Input || !(data instanceof Input) || data.length !== width * height)
    throw TypeError('guided mean requires a packed mono typed plane matching depth 0/2/5');
  if (depth === 5) for (const value of data)
    if (!Number.isFinite(value)) throw TypeError('guided mean requires finite FLOAT input');

  const k = 2 * radius + 1, scaleD = 1 / (k * k), scaleF = f(scaleD);
  const xMap = borderMap(width, radius), yMap = borderMap(height, radius);
  const Horizontal = depth === 0 ? Uint16Array : depth === 2 ? Int32Array : Float32Array;
  const horizontal = new Horizontal(data.length);
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    if (depth === 5 && radius < 3) {
      // k3/k5 are direct sums at every x; their SSE and scalar branches share this grouping.
      for (let x = 0; x < width; x++) {
        let sum = data[offset + xMap[x]];
        for (let j = 1; j < k; j++) sum = finiteF32(sum + data[offset + xMap[x + j]]);
        horizontal[offset + x] = sum;
      }
    } else {
      let sum = 0;
      for (let j = 0; j < k; j++) {
        const next = sum + data[offset + xMap[j]];
        sum = depth === 5 ? finiteF32(next) : next;
      }
      horizontal[offset] = sum;
      for (let x = 1; x < width; x++) {
        const enter = data[offset + xMap[x + k - 1]], leave = data[offset + xMap[x - 1]];
        sum = depth === 5 ? finiteF32(sum + finiteF32(enter - leave)) : sum + enter - leave;
        horizontal[offset + x] = sum;
      }
    }
  }

  const state = depth === 5 ? new Float32Array(width) : new Int32Array(width);
  // Preload exactly k-1 logical rows in order; repeated border samples remain separate adds.
  for (let j = 0; j < k - 1; j++) {
    const offset = yMap[j] * width;
    for (let x = 0; x < width; x++) {
      const next = state[x] + horizontal[offset + x];
      state[x] = depth === 5 ? finiteF32(next) : next;
    }
  }
  const output = new Float32Array(data.length);
  const block = depth === 0 ? 8 : 4, prefix = width - width % block;
  for (let y = 0; y < height; y++) {
    const offset = y * width, enter = yMap[y + k - 1] * width, leave = yMap[y] * width;
    for (let x = 0; x < width; x++) {
      if (depth === 5) {
        const total = finiteF32(state[x] + horizontal[enter + x]);
        output[offset + x] = finiteF32(total * scaleF);
        state[x] = finiteF32(total - horizontal[leave + x]);
      } else {
        const total = state[x] + horizontal[enter + x];
        // The integer column's remainder uses Double scale, including BYTE's Double4 group.
        output[offset + x] = x < prefix ? f(f(total) * scaleF) : f(total * scaleD);
        state[x] = total - horizontal[leave + x];
      }
    }
  }
  return output;
}

module.exports = {guidedMean};
