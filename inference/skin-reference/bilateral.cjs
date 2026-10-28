'use strict';
const f = Math.fround;
const counts = [0, 5, 13, 29];

function reflectWithoutEndpoint(i, size) {
  while (i < 0 || i >= size) i = i < 0 ? -i : 2 * size - i - 2;
  return i;
}

function nearestEven(value) {
  const integer = Math.floor(value), remainder = value - integer;
  return remainder > .5 || (remainder === .5 && integer % 2 !== 0) ? integer + 1 : integer;
}

function bilateralSuppliedWeights({data, width, height, radius, range, spatial, rounding = 'nearest-even'} = {}) {
  if (!Number.isInteger(width) || width < 5 || width > 1500 ||
      !Number.isInteger(height) || height < 5 || height > 1500)
    throw RangeError('bilateral dimensions must be integers in 5..1500');
  if (!Number.isInteger(radius) || radius < 1 || radius > 3)
    throw RangeError('bilateral radius must be an integer in 1..3');
  if (!(data instanceof Uint8Array) || data.length !== width * height)
    throw TypeError('bilateral requires a packed mono BYTE plane');
  if (!(range instanceof Float32Array) || range.length !== 256 ||
      !(spatial instanceof Float32Array) || spatial.length !== counts[radius])
    throw TypeError('bilateral requires explicit F32 range256 and spatial5/13/29 tables');
  for (const table of [range, spatial]) for (const weight of table)
    if (!Number.isFinite(weight) || weight < 0 || weight > 1)
      throw RangeError('bilateral weights must be finite in [0,1]');
  if (range[0] !== 1 || spatial[spatial.length >> 1] !== 1)
    throw RangeError('bilateral range0 and center spatial weight must equal1');
  if (rounding !== 'nearest-even') throw RangeError('bilateral supports only nearest-even rounding');

  const offsets = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++)
    if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
  const output = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const center = data[y * width + x];
    let sumW = 0, sum = 0;
    for (let k = 0; k < offsets.length; k++) {
      const [dx, dy] = offsets[k];
      const sx = reflectWithoutEndpoint(x + dx, width), sy = reflectWithoutEndpoint(y + dy, height);
      const neighbor = data[sy * width + sx];
      const weight = f(spatial[k] * range[Math.abs(neighbor - center)]);
      sumW = f(sumW + weight);
      sum = f(sum + f(neighbor * weight));
    }
    // Center weight1 keeps the divisor positive; the declared domain rounds into BYTE range.
    output[y * width + x] = nearestEven(f(sum / sumW));
  }
  return output;
}

module.exports = {bilateralSuppliedWeights};
