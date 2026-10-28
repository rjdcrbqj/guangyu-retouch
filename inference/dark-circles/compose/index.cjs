'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const geometry=require('./geometry.cjs'),numeric=require('./candidate.cjs');
const compose=require('./compose.cjs'),encode=require('./encode.cjs'),resize=require('./resize.cjs');
const f=Math.fround;
const TABLE_SHA256='fa3c20a3bad80c287916a73908399e9460085b64b64cfa54ffefc12feda636f4';
let savedTable;
function originalBilinearTable(){
 if(!savedTable){const b=fs.readFileSync(path.join(__dirname,'warp-table.s16'));
  if(b.length!==8192||crypto.createHash('sha256').update(b).digest('hex')!==TABLE_SHA256)throw Error('original SHORT table identity');
  savedTable=new Int16Array(4096);for(let i=0;i<savedTable.length;i++)savedTable[i]=b.readInt16LE(i*2);
 }return new Int16Array(savedTable);
}
function integers(v,n,name){if(!Array.isArray(v)||v.length!==n||!v.every(x=>Number.isInteger(x)&&x>=-2147483648&&x<=2147483647))throw new TypeError(name+' signed INT shape');return v.slice();}
function prepareResultRegions({localAffineF32,sourceROIWH,eyes}){
 if(!(localAffineF32 instanceof Float32Array)||localAffineF32.length!==6||!Array.from(localAffineF32).every(Number.isFinite))throw new TypeError('localAffineF32 finite F32[6]');
 const wh=integers(sourceROIWH,2,'sourceROIWH');if(wh.some(x=>x<=0))throw new RangeError('sourceROIWH positive');
 if(!Array.isArray(eyes)||eyes.length!==2||eyes[0].side!=='left'||eyes[1].side!=='right')throw new TypeError('ordered left/right original slots');
 const inverseF32=geometry.inverseAffineF32(localAffineF32);
 if(!Array.from(inverseF32).every(Number.isFinite))throw new RangeError('finite inverse domain');
 const regions=eyes.map((eye,slot)=>{
  if(typeof eye.active!=='boolean')throw new TypeError('explicit active gate');
  // Constructor145bf64c0 zeroes both ROI structs. Inactive producer leaves
  // the zero-width/height gate intact; there is no fabricated residual tensor.
  if(!eye.active)return {slot,side:eye.side,active:false,roi:[0,0,0,0],template:null,residual:null,width:0,height:0,emptyReason:'inactive-original-gate'};
  const rect=integers(eye.originalCropRect,4,'originalCropRect');
  if(rect[2]<=0||rect[3]<=0)return {slot,side:eye.side,active:true,roi:[0,0,0,0],template:null,residual:null,width:0,height:0,originalCropRect:rect,emptyReason:'nonpositive-original-crop'};
  const padding=integers(eye.padding,4,'padding [top,bottom,left,right]');if(padding.some(x=>x<0))throw new RangeError('nonnegative explicit padding');
  if(!Number.isInteger(eye.width)||!Number.isInteger(eye.height)||eye.width<0||eye.height<0)throw new RangeError('cropped residual dimensions');
  if(eye.width===0||eye.height===0)return {slot,side:eye.side,active:true,roi:[0,0,0,0],template:null,residual:null,width:0,height:0,originalCropRect:rect,padding,emptyReason:'empty-original-cropped-Mat'};
  if(eye.width!==rect[2]||eye.height!==rect[3]||!(eye.restoredCroppedResidual instanceof Float32Array)||eye.restoredCroppedResidual.length!==eye.width*eye.height*3||!Array.from(eye.restoredCroppedResidual).every(Number.isFinite))throw new TypeError('already resized/cropped finite FLOAT3 matching original crop WH');
  const [x,y,w,h]=rect,x1=(x+w)|0,y1=(y+h)|0;
  // Native INT additions precede CVTDQ2PS; corners use full width/height,
  // not width-1/height-1. Padding never shifts this original geometry.
  const corners=Float32Array.from([x,y,x1,y,x,y1,x1,y1],f);
  const transformed=geometry.transform2F32(corners,inverseF32);
  if(!Array.from(transformed).every(Number.isFinite))throw new RangeError('finite transformed corners');
  const bbox=geometry.bboxF32(transformed);
  if(!bbox.every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647))throw new RangeError('safe native bbox domain');
  const roi=geometry.clipResultROI(bbox,wh);
  return {slot,side:eye.side,active:true,roi,template:rect.slice(0,2),residual:eye.restoredCroppedResidual,width:eye.width,height:eye.height,originalCropRect:rect,padding,corners,transformed,bbox,emptyReason:roi[2]<=0||roi[3]<=0?'nonpositive-result-ROI':null};
 });
 return {inverseF32,regions,sourceROIWH:wh,scope:'Explicit original slot geometry; input FLOAT3 must already be resized/cropped. No original whole caller or runtime CPU selection claim.'};
}
function composeResult(options){return compose.composeResult({...options,table:originalBilinearTable()});}
module.exports={prepareResultRegions,composeResult,originalBilinearTable,TABLE_SHA256,numeric,geometry,encode80:encode.encode80,paste80:encode.paste80,resizeBYTE1:resize.resize};
