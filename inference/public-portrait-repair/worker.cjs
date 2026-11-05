'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { repairSkinSpots } = require('./core.cjs');
const result = repairSkinSpots(workerData, workerData.strength);
parentPort.postMessage(result, result.output ? [result.output.buffer] : []);
