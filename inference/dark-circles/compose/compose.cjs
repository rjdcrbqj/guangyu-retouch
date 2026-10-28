// Finite composition adapter. Explicit restored residuals, original geometric
// inputs, optional BYTE working mask, and numeric modes required. No NN/defaults.
const c=require('./candidate.cjs');
const {encode80}=require('./encode.cjs');
const {resize}=require('./resize.cjs');
function composeResult({source,width,height,channels,globalROI,regions,inverseF32,strength,encodeMode,neutralMode,metadataMode,workingMask,table}) {
 for(const mode of [encodeMode,metadataMode])if(!['scalar','sse','avx2'].includes(mode))throw Error('explicit numeric mode');
 if(!['scalar','sse'].includes(neutralMode))throw Error('explicit neutral mode');
 if(workingMask===undefined)throw Error('explicit workingMask; null only for confirmed empty apply branch');
 if(workingMask!==null&&(!(workingMask.data instanceof Uint8Array)||!Number.isInteger(workingMask.width)||!Number.isInteger(workingMask.height)||workingMask.width<1||workingMask.height<1||workingMask.data.length!==workingMask.width*workingMask.height))throw Error('working BYTE1 shape');
 if(!Number.isFinite(strength)||!Number.isFinite(Math.fround(strength)))throw Error('finite F32 strength');
 if(![3,4].includes(channels)||!(source instanceof Uint8Array)||source.length!==width*height*channels)throw Error('source BYTE3/4 shape');
 if(!(table instanceof Int16Array)||table.length!==4096)throw Error('original bilinear table');
 if(regions.length!==2||inverseF32.length!==6)throw Error('explicit two slots + F32 inverse');
 const [gx,gy,gw,gh]=globalROI;if(!globalROI.every(Number.isInteger)||gw<1||gh<1||gx<0||gy<0||gx+gw>width||gy+gh>height||gw>4096||gh>4096)throw Error('finite supplied globalROI');
 let global=new Uint8Array(gw*gh*3).fill(80),changed=null,magnitude=null;
 const prepared=[],working=workingMask==null?null:resize({...workingMask,targetWidth:gw,targetHeight:gh});
 for(let slot=0;slot<2;slot++) {const r=regions[slot],[x,y,w,h]=r.roi;
  if(w<=0||h<=0){prepared.push({slot,skipped:true,roi:r.roi});continue;}
  if(!r.roi.every(Number.isInteger)||x<0||y<0||x+w>gw||y+h>gh||!(r.residual instanceof Float32Array)||r.residual.length!==r.width*r.height*3)throw Error('finite supplied side');
  const scaled=c.scaleFloat3({data:r.residual,strength}),encoded=encode80({data:scaled,width:r.width,height:r.height,cpuMode:encodeMode});
  const matrix=c.translateInverse({inverse:inverseF32,template:r.template,roi:[x,y]}),warped=c.warpByte3({data:encoded,width:r.width,height:r.height,matrix,targetWidth:w,targetHeight:h,table});
  let data=warped.data,mask=null;if(working){mask=new Uint8Array(w*h);for(let j=0;j<h;j++)mask.set(working.subarray((y+j)*gw+x,(y+j)*gw+x+w),j*w);data=c.neutral80({data,mask,mode:neutralMode});}
  global=c.copyROI({data,global,width:gw,height:gh,roi:r.roi});const m=c.metadata({data:global,mode:metadataMode});
  changed=changed?c.maximum(changed,m.changed):m.changed;magnitude=magnitude?c.maximum(magnitude,m.magnitude):m.magnitude;
  prepared.push({slot,roi:r.roi,scaled,encoded,matrix,warped,mask,data});
 }
 const final=c.pasteTwo({source,width,height,channels,regions:prepared.filter(r=>!r.skipped).map(r=>({data:r.data,roi:[gx+r.roi[0],gy+r.roi[1],r.roi[2],r.roi[3]]}))});
 return {final,prepared,working,global,changed,magnitude,scope:'Explicit finite two-slot numeric adapter; contour/Photo wrapper, producer masks, original whole apply/CPU selection remain outside.'};
}
module.exports={composeResult};
