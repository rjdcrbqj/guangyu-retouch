'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { editHairColor } = require('./core.cjs');

const result = editHairColor(workerData, workerData.settings);
if (result.changedRGBFields) parentPort.postMessage(result, [result.output.buffer]);
else parentPort.postMessage({ changedRGBFields: 0 });
