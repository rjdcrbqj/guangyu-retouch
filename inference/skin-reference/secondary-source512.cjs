'use strict';
const {resizeSuppliedReferenceBaseSquare}=require('./base-resize.cjs');
const {prepareSuppliedSecondaryLookupGray}=require('./secondary-gray-lookup.cjs');
const {prepareSuppliedSecondaryProtectionMasks}=require('./secondary-protection.cjs');
const {resizeSuppliedSecondaryMaskFrom512}=require('./secondary-resize.cjs');
function unavailable(reason){return {available:false,reason,high:null,derivedLow:null,auxiliary:null};}

// 明确actual zero counters/table供给的512数学组合；不把原opaque初始化请求当作实际值。
function prepareSuppliedSecondaryFrom512Source(r){
 if(!r||r.math!=='native-byte3-byte1-code1-secondary512-supplied'||r.rounding!=='nearest-even'||r.histogramMaskThreshold!==0)throw TypeError('二次保护512需要明确code1/nearest-even/阈值0供给');
 if(![r.highFraction,r.lowFraction].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))throw TypeError('二次保护512需要明确high/low比例');
 const initial=r.initialCounters,grayTable=r.grayTable;
 if(initial===undefined||initial===null)return unavailable('missing-initial-counters');
 if(!(initial instanceof Int32Array)||initial.length!==256)throw TypeError('二次保护512需要实际256项INT32初值');
 const counters=new Int32Array(initial);
 if(!counters.every(v=>v===0))throw RangeError('二次保护512实际计数初值必须全0');
 if(grayTable===undefined||grayTable===null)return unavailable('missing-gray-table');
 if(!(grayTable instanceof Uint8Array)||grayTable.length!==256)throw TypeError('二次保护512需要实际256BYTE灰度表');
 const table=new Uint8Array(grayTable),photo=r.sourcePhoto,mask=r.sourceMask;
 if(!photo||!mask||photo.channels!==3||(mask.channels!==undefined&&mask.channels!==1)||
  ![photo.width,photo.height].every(v=>Number.isInteger(v)&&v>=2&&v<=4096)||mask.width!==photo.width||mask.height!==photo.height)throw RangeError('二次保护512需同WH2..4096 physical BYTE3照片/BYTE1蒙版');
 const destinationWH=[photo.width,photo.height];
 const photo512=resizeSuppliedReferenceBaseSquare({...photo,side:512,rounding:r.rounding});
 const mask512=resizeSuppliedReferenceBaseSquare({...mask,channels:1,side:512,rounding:r.rounding});
 const lookup=prepareSuppliedSecondaryLookupGray({photo:photo512,table,math:'native-cvt6-u8-generic-then-lut0'}).lookupGray;
 for(let i=0;i<262144;i++)if(mask512.data[i]>0)counters[lookup.data[i]]++;
 const histogram=Float32Array.from(counters);
 const prepared=prepareSuppliedSecondaryProtectionMasks({width:512,height:512,histogram,lookupGray:lookup.data,inputMask:mask512.data,
  highFraction:r.highFraction,lowFraction:r.lowFraction,math:'native-byte1-packed-no-tail-histogram-supplied'});
 if(!prepared.available)return {...prepared,histogram,workingWH:[512,512]};
 function restore(m){return resizeSuppliedSecondaryMaskFrom512({data:m.data,stride:m.stride,destinationWH,rounding:r.rounding,math:'native-code1-scalar-secondary512'});}
 return {...prepared,high:restore(prepared.high),derivedLow:restore(prepared.derivedLow),histogram,workingWH:[512,512]};
}
module.exports={prepareSuppliedSecondaryFrom512Source};
