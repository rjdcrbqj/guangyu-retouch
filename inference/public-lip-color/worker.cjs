'use strict';
const {parentPort, workerData} = require('node:worker_threads');
const {editLipColor} = require('./core.cjs');

const result = editLipColor(workerData,workerData.settings);
parentPort.postMessage(result,[result.output.buffer]);
