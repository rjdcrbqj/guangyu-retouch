'use strict';
const sharp = require('sharp');
const {isMarkedAsUntransferable} = require('node:worker_threads');
const {PublicFaceDetector} = require('../public-yunet/detector.cjs');
const {PublicFaceLandmarks} = require('../public-landmarks/service.cjs');
const {prepareLips} = require('../public-lip-wrinkle/geometry.cjs');
const {runPhotoWorker} = require('../public-frame-worker.cjs');
const {lipColorSettings} = require('./core.cjs');

function reliableContour(polygon,mouthWidth) {
  const lengths = polygon.map((point,index)=>{
    const next = polygon[(index+1)%polygon.length];
    return Math.hypot(next.x-point.x,next.y-point.y);
  });
  const sorted = lengths.slice().sort((a,b)=>a-b);
  const longEdge = Math.max(mouthWidth*.18,sorted[Math.floor(sorted.length/2)]*2.2);
  // 单个脱离轮廓的点会同时拉长前后两条边。
  return !lengths.some((length,index)=>length>longEdge&&lengths[(index+1)%lengths.length]>longEdge);
}

class PublicLipColorService {
  constructor({detector = new PublicFaceDetector(), landmarks = new PublicFaceLandmarks(), ownsDependencies=true} = {}) {
    this.detector = detector;
    this.landmarks = landmarks;
    this.ownsDependencies = ownsDependencies;
    this.closed = false;
    this.active = null;
    this.closing = null;
  }

  async repair(bytes, options) {
    if (this.closed) throw Error('唇色服务已关闭');
    if (this.active) throw Error('唇色正在处理，请稍候');
    const settings = lipColorSettings(options);
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 64 * 1024 * 1024) {
      throw Error('照片内容无效');
    }
    let finish;
    this.active = new Promise(resolve => {finish = resolve;});
    const start = performance.now();
    try {
      const {data, info:{width,height,channels}} = await sharp(bytes,{limitInputPixels:80000000,failOn:'error'})
        .rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
      if (width > 32766 || height > 32766 || channels !== 4) throw Error('唇色照片尺寸无效');
      const found = settings.strengthPercent ? await this.detector.detect(bytes) : {width,height,boxes:[]};
      if (found.width !== width || found.height !== height || !Array.isArray(found.boxes)) {
        throw Error('人脸定位与照片尺寸不匹配');
      }
      const regions = [];
      for (const box of found.boxes.slice(0,8)) {
        let face;
        try {
          face = await this.landmarks.detect(bytes,box);
        } catch (error) {
          if (error.code === 'ERR_PUBLIC_LANDMARKS_UNRELIABLE') continue;
          throw error;
        }
        if (face.width !== width || face.height !== height) throw Error('唇部定位与照片尺寸不匹配');
        const geometry = prepareLips(face);
        if (geometry && reliableContour(geometry.outer,geometry.mouthWidth) &&
          reliableContour(geometry.inner,geometry.mouthWidth)) regions.push(geometry);
      }
      const transferable = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength &&
        !isMarkedAsUntransferable?.(data.buffer);
      const result = regions.length
        ? await runPhotoWorker(require.resolve('./worker.cjs'),{data,width,height,regions,settings},
            transferable ? [data.buffer] : [])
        : {changedRGBFields:0,processedFaces:0};
      const png = result.changedRGBFields
        ? await sharp(result.output,{raw:{width,height,channels:4}}).png().toBuffer()
        : Buffer.alloc(0);
      return {png,width,height,changedRGBFields:result.changedRGBFields,processedFaces:result.processedFaces,
        detectedFaces:found.boxes.length,seconds:(performance.now()-start)/1000,
        backend:'public-lip-color',nativeApplicationParity:false};
    } finally {
      this.active = null;
      finish();
    }
  }

  async close() {
    this.closed = true;
    if (!this.closing) this.closing = (async () => {
      await this.active;
      if (this.ownsDependencies) await Promise.all([this.detector.close(),this.landmarks.close()]);
    })();
    return this.closing;
  }
}

module.exports = {PublicLipColorService};
