'use strict';
const { Worker, isMarkedAsUntransferable } = require('node:worker_threads');
// Only the decoded working frame changes ownership. Encoded project originals stay intact.
function correctFrame(workerFile, frame, regions, strength) {
  const data = frame.data;
  const transferable =
    data.byteOffset === 0 &&
    data.byteLength === data.buffer.byteLength &&
    !isMarkedAsUntransferable?.(data.buffer);
  return runPhotoWorker(workerFile, { ...frame, regions, strength }, transferable ? [data.buffer] : []);
}

function runPhotoWorker(workerFile, workerData, transferList = []) {
  const worker = new Worker(workerFile, { workerData, transferList });
  return new Promise((resolve, reject) => {
    let result;
    worker.once('message', (value) => {
      result = value;
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code === 0 && result) resolve(result);
      else reject(Error('照片处理线程异常退出'));
    });
  });
}
module.exports = { correctFrame, runPhotoWorker };
