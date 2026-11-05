'use strict';
const {runPhotoWorker} = require('../public-frame-worker.cjs');

// 一次只计算一张照片，退出时等候已经提交的作业释放原尺寸缓冲。
class PublicReferenceService {
  constructor() {
    this.closed = false;
    this.active = null;
  }
  async run(request) {
    if (this.closed) throw Error('参考肤色服务已关闭');
    if (this.active) throw Error('参考肤色正在处理，请稍候');
    this.active = runPhotoWorker(require.resolve('./public-worker.cjs'), request);
    try {
      return await this.active;
    } finally {
      this.active = null;
    }
  }
  async close() {
    this.closed = true;
    await this.active?.catch(() => {});
  }
}
module.exports = {PublicReferenceService};
