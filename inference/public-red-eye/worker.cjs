'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {correctRedEye}=require('./core.cjs');
const result=correctRedEye(workerData,workerData.settings);parentPort.postMessage(result,[result.output.buffer]);
