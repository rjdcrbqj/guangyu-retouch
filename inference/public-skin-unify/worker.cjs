'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { correctSkinTone } = require('./core.cjs');
const result = correctSkinTone(workerData, workerData.strength);
parentPort.postMessage(result, result.output ? [result.output.buffer] : []);
