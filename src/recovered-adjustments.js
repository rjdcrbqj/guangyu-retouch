// Formula provenance and integration limits: docs/批量调色证据.json.
// These wrappers use caller-supplied RGB; they neither sample nor alter alpha.
export const adjustmentSpecs = Object.freeze([
  {key:'fadeAmount',label:'褪色（%）',min:0,max:100,step:1,default:0,group:'basic'},
  {key:'hueRotation',label:'色相旋转（°）',min:-180,max:180,step:1,default:0,group:'basic'},
  {key:'blackWhiteAmount',label:'黑白（%）',min:0,max:100,step:1,default:0,group:'basic'},
  {key:'localFade',label:'局部褪色（%）',min:0,max:100,step:1,default:0,group:'local'},
  {key:'localHue',label:'局部色相（°）',min:-180,max:180,step:1,default:0,group:'local'},
  {key:'localBlackWhite',label:'局部黑白（%）',min:0,max:100,step:1,default:0,group:'local'},
]);

export const recoveredAdjustmentsGLSL = `
vec3 recoveredFade(vec3 c, float percent) {
    vec3 curve = (-0.87 * c + 1.515) * c * c + 0.24;
    return mix(c, curve, percent / 100.0);
}
vec3 recoveredRGBToHSV(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 recoveredHSVToRGB(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 recoveredHueRotation(vec3 c, float degrees) {
    vec3 hsv = recoveredRGBToHSV(c);
    hsv.x = fract(hsv.x + degrees / 360.0 + 1.0);
    return recoveredHSVToRGB(hsv);
}
vec3 recoveredBlackWhite(vec3 c, float percent) {
    // WBFilter's alpha=0 branch is exact gray; this intensity blend is our integration.
    float gray = dot(c, vec3(0.299, 0.587, 0.114));
    return mix(c, vec3(gray), percent / 100.0);
}
vec3 recoveredAdjustments(vec3 c, float fadePercent, float hueDegrees, float blackWhitePercent) {
    // Composition order belongs to this app; it is not a recovered native pipeline.
    // Preserve exact identity at zero, avoiding an unnecessary HSV round trip.
    if (abs(hueDegrees) > 0.0) c = recoveredHueRotation(c, hueDegrees);
    if (fadePercent > 0.0) c = recoveredFade(c, fadePercent);
    if (blackWhitePercent > 0.0) c = recoveredBlackWhite(c, blackWhitePercent);
    return c;
}
`;
