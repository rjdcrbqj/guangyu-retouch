'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { correctWrinkles } = require('./core.cjs');
const result = correctWrinkles(workerData, workerData.strength);
parentPort.postMessage(result, result.output ? [result.output.buffer] : []);
