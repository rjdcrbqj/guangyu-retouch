// 原三次样条的研究转写；仅支持眼部路径实际使用的 mode 30、零二阶边界。
const f = Math.fround;
const add = (a, b) => f(a + b);
const sub = (a, b) => f(a - b);
const mul = (a, b) => f(a * b);
const div = (a, b) => f(a / b);

// 原 band_matrix 先逐行归一化，再进行带宽 1 的 LU 分解和前后代入。
function coefficients(knots, values) {
  const n = knots.length;
  const low = new Float32Array(n), diag = new Float32Array(n), high = new Float32Array(n);
  const rhs = new Float32Array(n), saved = new Float32Array(n);
  diag[0] = diag[n - 1] = 2;
  for (let i = 1; i < n - 1; i++) {
    const before = sub(knots[i], knots[i - 1]);
    const after = sub(knots[i + 1], knots[i]);
    low[i] = f(before * (1 / 3));
    high[i] = f(after * (1 / 3));
    diag[i] = f(sub(knots[i + 1], knots[i - 1]) * (2 / 3));
    rhs[i] = sub(div(sub(values[i + 1], values[i]), after),
                 div(sub(values[i], values[i - 1]), before));
  }
  for (let i = 0; i < n; i++) {
    saved[i] = div(1, diag[i]);
    low[i] = mul(saved[i], low[i]);
    high[i] = mul(saved[i], high[i]);
    diag[i] = 1;
  }
  for (let i = 0; i < n - 1; i++) {
    const factor = div(-low[i + 1], diag[i]);
    low[i + 1] = f(-factor);
    diag[i + 1] = add(mul(high[i], factor), diag[i + 1]);
  }
  const forward = new Float32Array(n), quadratic = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const sum = i ? add(mul(low[i], forward[i - 1]), 0) : 0;
    forward[i] = sub(mul(rhs[i], saved[i]), sum);
  }
  for (let i = n - 1; i >= 0; i--) {
    const sum = i + 1 < n ? add(0, mul(high[i], quadratic[i + 1])) : 0;
    quadratic[i] = div(sub(forward[i], sum), diag[i]);
  }
  const cubic = new Float32Array(n), linear = new Float32Array(n);
  for (let i = 0; i < n - 1; i++) {
    const h = sub(knots[i + 1], knots[i]);
    cubic[i] = f((sub(quadratic[i + 1], quadratic[i]) * (1 / 3)) / h);
    linear[i] = f((quadratic[i] + quadratic[i] + quadratic[i + 1]) * (-1 / 3) * h +
                  div(sub(values[i + 1], values[i]), h));
  }
  const last = n - 1, h = sub(knots[last], knots[last - 1]);
  linear[last] = f(linear[last - 1] + cubic[last - 1] * 3 * h * h +
                   (quadratic[last - 1] + quadratic[last - 1]) * h);
  return {values, knots, linear, quadratic, cubic};
}

// 原 14705c550 使用 upper_bound 后按 F32 Horner 顺序求值。
function evaluate(spline, value) {
  const {knots, values, linear, quadratic, cubic} = spline;
  let upper = 0;
  while (upper < knots.length && knots[upper] <= value) upper++;
  const i = Math.max(upper, 1) - 1;
  const h = sub(value, knots[i]);
  return add(mul(add(mul(add(mul(cubic[i], h), quadratic[i]), h), linear[i]), h), values[i]);
}

// 原 1460db090 对每段采样三个点，最后附加最终端点；闭合眼环需输入首点重复。
export function eyeSpline(points, subdivisions = 2) {
  const n = points.length;
  if (n < 3 || subdivisions < 0 || !Number.isInteger(subdivisions)) throw new Error('invalid spline input');
  const xs = Float32Array.from(points, p => p[0]), ys = Float32Array.from(points, p => p[1]);
  const knots = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const dx = sub(xs[i], xs[i - 1]), dy = sub(ys[i], ys[i - 1]);
    knots[i] = add(f(Math.sqrt(add(mul(dx, dx), mul(dy, dy)))), knots[i - 1]);
    if (!(knots[i] > knots[i - 1])) throw new Error('degenerate spline input');
  }
  const sx = coefficients(knots, xs), sy = coefficients(knots, ys);
  const output = new Float32Array((n + (n - 1) * subdivisions) * 2);
  let o = 0;
  for (let i = 1; i < n; i++) {
    const step = div(sub(knots[i], knots[i - 1]), f(subdivisions + 1));
    for (let j = 0; j <= subdivisions; j++) {
      const t = add(mul(f(j), step), knots[i - 1]);
      output[o++] = evaluate(sx, t);
      output[o++] = evaluate(sy, t);
    }
  }
  output[o++] = xs[n - 1];
  output[o++] = ys[n - 1];
  return output;
}

// 原 1460c4220：中心 + 内环前 24 点 + 扩展 1.55 倍后的外环前 24 点。
export function eyeGrid(points, center, pupil = center) {
  if (points.length !== 8) throw new Error('eye grid requires eight contour points');
  const source = points.map(p => [f(p[0]), f(p[1])]);
  const c = center.map(f);
  const outer = source.map(p => p.map((v, i) => add(mul(sub(v, c[i]), f(1.55)), c[i])));
  const innerSamples = eyeSpline([...source, source[0]]);
  const outerSamples = eyeSpline([...outer, outer[0]]);
  const result = new Float32Array(98);
  result.set(pupil.map(f));
  result.set(innerSamples.subarray(0, 48), 2);
  result.set(outerSamples.subarray(0, 48), 50);
  return result;
}

// 原 SIMD 顺序先 corner0+pupil，再 corner1+sum；随后除 3。
export function eyeCenterRadius(triplet) {
  const [p0,p1,pupil] = triplet.map(p => p.map(f));
  const center = p0.map((v,i) => div(add(p1[i],add(v,pupil[i])),3));
  const distances = [p0,p1].map(p => {
    const dx=sub(p[0],center[0]),dy=sub(p[1],center[1]);
    return f(Math.sqrt(add(mul(dx,dx),mul(dy,dy))));
  });
  return new Float32Array([...center,mul(add(distances[1],distances[0]),.5)]);
}

// 原1460dc320在全路径弧长范围均匀采样，和1460db090逐段采样分别核对。
export function uniformEyeSpline(points,count=13){const n=points.length,xs=Float32Array.from(points,p=>p[0]),ys=Float32Array.from(points,p=>p[1]),knots=new Float32Array(n);for(let i=1;i<n;i++){const dx=sub(xs[i],xs[i-1]),dy=sub(ys[i],ys[i-1]);knots[i]=add(f(Math.sqrt(add(mul(dx,dx),mul(dy,dy)))),knots[i-1]);}const sx=coefficients(knots,xs),sy=coefficients(knots,ys),out=new Float32Array(count*2),step=div(sub(knots[n-1],knots[0]),f(count-1));for(let i=0;i<count;i++){const t=add(mul(f(i),step),knots[0]);out[2*i]=evaluate(sx,t);out[2*i+1]=evaluate(sy,t);}return out;}
