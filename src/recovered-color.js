// 原 PaintFX 公式；来源与哈希见 docs/0.3调色来源.md。处理顺序与选区混合为本软件集成。
export const recoveredColorGLSL = `// Adapted function wrappers around the formulas of the recovered PaintFX resources.
// This file adds no transfer function. RGB input/output is normalized [0,1].
vec3 recoveredVibrance(vec3 c, float amount) {
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    float gray = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float factor = 1.0 + amount * (1.0 - sat);
    return clamp(mix(vec3(gray), c, factor), 0.0, 1.0);
}
float recoveredSigmoid(float x, float k) {
    return 1.0 / (1.0 + exp(-k * x));
}
float recoveredContrastChannel(float x, float k, float p) {
    if (abs(k) < 0.001) return x;
    float lo = recoveredSigmoid(-p, k);
    float hi = recoveredSigmoid(1.0 - p, k);
    float val = recoveredSigmoid(x - p, k);
    return clamp((val - lo) / (hi - lo), 0.0, 1.0);
}
vec3 recoveredContrast(vec3 c, float amount, float pivot) {
    float p = clamp(pivot, 0.02, 0.98);
    if (amount < 0.0) return clamp((c - vec3(p)) * (1.0 + amount) + vec3(p), 0.0, 1.0);
    float k = amount * 10.0;
    return vec3(recoveredContrastChannel(c.r, k, p), recoveredContrastChannel(c.g, k, p), recoveredContrastChannel(c.b, k, p));
}
`;
