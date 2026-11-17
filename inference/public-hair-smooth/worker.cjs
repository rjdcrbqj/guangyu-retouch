'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {smoothHair}=require('./core.cjs');
const result=smoothHair(workerData,workerData.settings);parentPort.postMessage(result,[result.output.buffer]);
