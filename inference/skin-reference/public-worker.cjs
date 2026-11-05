'use strict';
const {parentPort, workerData} = require('node:worker_threads');
const {SkinReferenceProcessor} = require('./processor.cjs');

async function processPhoto() {
  const processor = new SkinReferenceProcessor();
  try {
    const result = await processor.run(workerData);
    parentPort.postMessage(result, [result.output.buffer, result.finalMask.buffer]);
  } finally {
    await processor.close();
  }
}
processPhoto().catch(error => {throw error;});
