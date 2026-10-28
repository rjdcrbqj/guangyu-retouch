'use strict';
const f=Math.fround;
const inputAPI=require('./input/index.cjs'),resultAPI=require('./compose/index.cjs'),cv=require('../opencv-runtime.cjs');
function restoreResidual({corrected,mask,source,channels}){
 if(!(mask instanceof Float32Array)||!(corrected instanceof Float32Array)||!(source instanceof Uint8Array)||![3,4].includes(channels)||corrected.length!==mask.length*3||source.length!==mask.length*channels||!corrected.every(Number.isFinite)||!mask.every(Number.isFinite))throw new TypeError('祛黑眼圈恢复数据无效');
 const area=mask.length,result=new Float32Array(area*3);
 for(let i=0;i<area;i++)for(let c=0;c<3;c++)result[i*3+c]=f(f(corrected[c*area+i]-source[i*channels+c])*mask[i]);
 return result;
}
async function runFace({source,width,height,channels=3,geometry,workingMask,strength,imageLibrary=cv,diagnostics=false},infer){
 if(!(source instanceof Uint8Array)||![3,4].includes(channels)||!Number.isInteger(width)||!Number.isInteger(height)||source.length!==width*height*channels)throw Error('祛黑眼圈源照片无效');
 const roi=Array.from(geometry?.ROI||[]),empty=reason=>({output:source.slice(),processed:false,modelOrder:[],rois:[[0,0,0,0],[0,0,0,0]],crops:[null,null],emptyReason:reason});
 if(roi.length!==4||!roi.every(Number.isInteger))throw Error('祛黑眼圈人脸区域无效');
 if(!roi.every((v,i)=>v>[-1,-1,9,9][i]))return empty('original-source-ROI-gate');
 if(roi[2]>4096||roi[3]>4096||roi[0]+roi[2]>width||roi[1]+roi[3]>height)throw Error('祛黑眼圈人脸区域超出处理范围');
 if(!workingMask||workingMask.width!==512||workingMask.height!==512||!(workingMask.data instanceof Uint8Array)||workingMask.data.length!==512*512)throw Error('祛黑眼圈需要原512工作保护mask');
 if(!Number.isFinite(strength)||!Number.isFinite(f(strength)))throw Error('祛黑眼圈强度无效');
 for(const side of ['left','right'])if(typeof geometry.poseGate?.[side]!=='boolean')throw Error('祛黑眼圈姿态门槛无效');
 if(!geometry.poseGate.left&&!geometry.poseGate.right)return empty('inactive-original-pose-gates');
 await imageLibrary.initializeOpenCV?.();
 const sourceROI=inputAPI.cropBytes(source,width,height,channels,roi),aligned1536=imageLibrary.warpBytes({data:sourceROI,width:roi[2],height:roi[3],channels,affine:geometry.localAffine,targetWidth:1536,targetHeight:1536,borderValue:0});
 const eyes=[],modelOrder=[],details=[];
 for(const side of ['left','right']){
  if(!geometry.poseGate[side]){eyes.push({side,active:false});details.push(null);continue;}
  const prepared=inputAPI.prepareEyeInput({aligned1536,aligned194:geometry.aligned194,side,channels,imageLibrary});
  if(!prepared.decision.valid){eyes.push({side,active:false});details.push(null);continue;}
  const prediction=await infer(side,{data:prepared.tensor,dimensions:[1,3,384,384]});modelOrder.push(side);
  const residual384=restoreResidual({...prediction,source:prepared.resized,channels}),residual=inputAPI.resizeResidual({residual384,squareWH:[prepared.padded.width,prepared.padded.height],paddingTopBottomLeftRight:prepared.padded.edges,originalCropRect:prepared.decision.rect});
  eyes.push({side,active:true,originalCropRect:prepared.decision.rect,padding:prepared.padded.edges,restoredCroppedResidual:residual.cropped,width:residual.unpaddedROI[2],height:residual.unpaddedROI[3]});
  details.push(diagnostics?{prepared,prediction,residual384,residual}:null);
 }
 const regions=resultAPI.prepareResultRegions({localAffineF32:geometry.localAffine,sourceROIWH:roi.slice(2),eyes});
 if(!regions.regions.some(r=>r.roi[2]>0&&r.roi[3]>0))return {...empty('nonpositive-result-regions'),modelOrder,crops:eyes.map(e=>e.originalCropRect||null)};
 // Select the verified scalar branches explicitly. Original automatic CPU
 // dispatch is a boundary, and must not be inferred from the current machine.
 const composed=resultAPI.composeResult({source,width,height,channels,globalROI:roi,...regions,strength,workingMask,encodeMode:'scalar',neutralMode:'scalar',metadataMode:'scalar'});
 return {output:composed.final,processed:true,modelOrder,rois:regions.regions.map(r=>r.roi),crops:eyes.map(e=>e.originalCropRect||null),...(diagnostics?{diagnostics:{sourceROI,aligned1536,eyes:details,regions,composed}}:{})};
}
module.exports={restoreResidual,runFace};
