'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {editIris}=require('./core.cjs');
const result=editIris(workerData,workerData.settings);parentPort.postMessage(result,[result.output.buffer]);
