'use strict';
const {lipWeight} = require('../public-lip-wrinkle/geometry.cjs');
const {dimensions} = require('../public-portrait-geometry.cjs');

const clamp = v => Math.max(0, Math.min(1, v));
const smooth = v => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const linear = Float64Array.from({length:256}, (_, byte) => {
  const v = byte / 255;
  return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
});
const encode = v => {
  const x = clamp(v);
  return Math.round(255 * (x <= .0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - .055));
};
const light = (r,g,b) => r * .2126 + g * .7152 + b * .0722;

function lipColorSettings(options) {
  const {color, strengthPercent} = options || {};
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => key !== 'color' && key !== 'strengthPercent') ||
      typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color) ||
      !Number.isFinite(strengthPercent) || strengthPercent < 0 || strengthPercent > 100) {
    throw Error('唇色参数无效');
  }
  return {color:color.toLowerCase(), strengthPercent};
}

function highlightStart(data, width, geometry) {
  const {left,top,width:rw,height:rh} = geometry.crop;
  const step = Math.max(1, Math.ceil(Math.max(rw,rh) / 48));
  const samples = [];
  for (let y=top;y<top+rh;y+=step) for (let x=left;x<left+rw;x+=step) {
    const i = (y * width + x) * 4;
    if (data[i+3] && lipWeight(geometry,x+.5,y+.5) > .75) {
      samples.push(light(linear[data[i]],linear[data[i+1]],linear[data[i+2]]));
    }
  }
  samples.sort((a,b) => a-b);
  return Math.min(.72, Math.max(.14, (samples[Math.floor(samples.length / 2)] ?? .08) * 1.7 + .04));
}

function editLipColor(frame, options) {
  const {color,strengthPercent} = lipColorSettings(options);
  const {width,height,data,regions} = frame || {};
  dimensions(width,height,80000000);
  if (!(data instanceof Uint8Array) || data.length !== width * height * 4 ||
      !Array.isArray(regions) || regions.length > 8) {
    throw Error('唇色照片或定位区域无效');
  }
  if (!strengthPercent) return {output:data,changedRGBFields:0,processedFaces:0};
  const target = [1,3,5].map(offset => linear[parseInt(color.slice(offset,offset+2),16)]);
  const targetLight = light(...target);
  const chroma = target.map(v => v - targetLight);
  const output = new Uint8Array(data);
  let changedRGBFields = 0, processedFaces = 0;
  for (const region of regions) {
    // 唇色比纹理修饰更容易显露边缘，沿几何内侧增加过渡。
    const geometry = {...region,feather:Math.max(region.feather,(region.mouthWidth ?? 0) * .016)};
    const {left,top,width:rw,height:rh} = geometry.crop;
    if (![left,top,rw,rh].every(Number.isSafeInteger) || left < 0 || top < 0 ||
        rw < 1 || rh < 1 || left + rw > width || top + rh > height) {
      throw Error('唇色定位区域超出照片');
    }
    const highlight = highlightStart(data,width,geometry);
    let contributed = false;
    for (let y=top;y<top+rh;y++) for (let x=left;x<left+rw;x++) {
      const i = (y * width + x) * 4;
      if (data[i+3] === 0) continue;
      const weight = lipWeight(geometry,x+.5,y+.5);
      if (!weight) continue;
      const rgb = [linear[data[i]],linear[data[i+1]],linear[data[i+2]]];
      const luminance = light(...rgb);
      const protection = smooth((luminance-.002)/.018) * (1-smooth((luminance-highlight)/.13));
      const amount = strengthPercent / 100 * weight * protection;
      if (!amount) continue;
      // 以像素自己的线性亮度为中性基底，在可表示色域内加入目标色的色度。
      const gain = Math.min(luminance / Math.max(.01,targetLight), (1-luminance) / Math.max(.01,1-targetLight));
      const next = rgb.map((v,k) => encode(v + (luminance + gain * chroma[k] - v) * amount));
      const change = next.reduce((sum,v,k) => sum + Math.abs(v-data[i+k]),0);
      const previous = next.reduce((sum,_,k) => sum + Math.abs(output[i+k]-data[i+k]),0);
      if (change <= previous) continue;
      contributed = true;
      for (let k=0;k<3;k++) {
        changedRGBFields += Number(next[k] !== data[i+k]) - Number(output[i+k] !== data[i+k]);
        output[i+k] = next[k];
      }
    }
    if (contributed) processedFaces++;
  }
  return {output,changedRGBFields,processedFaces};
}

module.exports = {editLipColor, lipColorSettings};
