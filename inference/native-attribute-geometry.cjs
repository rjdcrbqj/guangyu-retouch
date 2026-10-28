'use strict';
const f = Math.fround;
// Original1444fb240/144501910 fit is supplied explicitly: its native float SVD
// has not been replaced by an unverified double least-squares implementation.
function attribute0MatrixFromNativeFit(nativeFit) {
  if (!nativeFit || nativeFit.length !== 6 || !Array.from(nativeFit).every(Number.isFinite))
    throw new Error('original raw142-to-template142 float32 fit required');
  let a = Array.from(nativeFit, v => f(f(v) * f(1 / 3)));
  a[2] = f(a[2] + f(-128)); a[5] = f(a[5] + f(-128));
  a = a.map(v => f(v * f(1.15)));
  a[2] = f(a[2] + f(128)); a[5] = f(a[5] + f(128));
  return new Float32Array(a);
}
// The four trig results represent the native149a44e68/149a44d20 callbacks.
// Keeping them explicit exposes the remaining original math-runtime parity question.
function attribute34Geometry(raw194, { sinAngle, cosAngle, sinNegativeAngle, cosNegativeAngle }) {
  if (!raw194 || raw194.length < 142 || !raw194.slice(0,142).every(p => p.length === 2 && p.every(Number.isFinite)))
    throw new Error('original first142 raw points required');
  if (![sinAngle,cosAngle,sinNegativeAngle,cosNegativeAngle].every(Number.isFinite))
    throw new Error('four native float32 trig results required');
  const p = raw194.slice(0,142).map(p => p.map(f));
  const minx = Math.min(...p.map(p=>p[0])), miny = Math.min(...p.map(p=>p[1]));
  const w = f(Math.max(...p.map(p=>p[0])) - minx), h = f(Math.max(...p.map(p=>p[1])) - miny);
  const span = f(f(f(w+h)/f(2))*f(.4));
  const dx = f(f(sinAngle)*span), dy = f(f(-span)*f(cosAngle));
  const width = f(w+Math.abs(dx)), height = f(h+Math.abs(dy));
  //1470f71d8..7223: old center, then half displacement, then negative new halfspan.
  const x = f(f(width*f(-.5))+f(f(dx*f(.5))+f(minx+f(w*f(.5)))));
  const y = f(f(height*f(-.5))+f(f(dy*f(.5))+f(miny+f(h*f(.5)))));
  const cx = f(f(width*f(.5))+x), cy = f(f(height*f(.5))+y);
  const scale = f(f(116.8)/Math.max(width,height));
  const a = f(f(cosNegativeAngle)*scale), b = f(f(-f(sinNegativeAngle))*scale);
  const c = f(f(sinNegativeAngle)*scale), d = f(f(cosNegativeAngle)*scale);
  // 144530e98/eA1 then eAD: add the two products first, then add old73.
  const tx = f(f(73)+f(f(b*f(-cy))+f(a*f(-cx))));
  const ty = f(f(73)+f(f(c*f(-cx))+f(d*f(-cy))));
  return { sourcePointCount:142, bounds:[x,y,width,height], scale,
    affine:new Float32Array([a,b,tx,c,d,ty]), inputSide:146, colorOrder:'BGR',
    normalizationScale:f(1/255), originalMathRuntimeParity:false };
}
module.exports={attribute0MatrixFromNativeFit,attribute34Geometry};
