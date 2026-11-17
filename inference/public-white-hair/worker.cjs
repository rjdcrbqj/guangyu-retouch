'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {correctWhiteHair}=require('./core.cjs');
const result=correctWhiteHair(workerData,workerData.settings);parentPort.postMessage(result,[result.output.buffer]);
