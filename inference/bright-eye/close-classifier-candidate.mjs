'use strict';
// Complete finite close-eye numerical candidate. Original scalar/SSE operation boundaries are explicit.
// The acosf backend is the original-package UCRT candidate, not an assertion of protected live IAT installation.
import {bundledAcosfCandidate,bits,fromBits} from './bundled-acosf-candidate.mjs';
const f=Math.fround;
const constants=[{"address":"0x148e2f52c","format":"f","bytes":"17b7d138","values":[9.999999747378752e-05]},{"address":"0x148fda75c","format":"f","bytes":"9a99193f","values":[0.6000000238418579]},{"address":"0x1490290d8","format":"2f","bytes":"000080bf0000803f","values":[-1.0,1.0]},{"address":"0x148e19480","format":"d","bytes":"8dedb5a0f7c6b03e","values":[1e-06]},{"address":"0x148fb0338","format":"f","bytes":"00003443","values":[180.0]},{"address":"0x149148708","format":"f","bytes":"d80f4940","values":[3.141592025756836]},{"address":"0x148eea150","format":"f","bytes":"00000040","values":[2.0]},{"address":"0x148e2f4c4","format":"f","bytes":"cdcccc3d","values":[0.10000000149011612]},{"address":"0x148e19460","format":"f","bytes":"0000803f","values":[1.0]},{"address":"0x148e1945c","format":"f","bytes":"0000003f","values":[0.5]},{"address":"0x148e5b520","format":"f","bytes":"00004040","values":[3.0]}];
const values=new Map(constants.map(r=>[r.address,r.values]));const c=a=>values.get('0x'+a.toString(16))[0];
const add=(a,b)=>f(a+b),sub=(a,b)=>f(a-b),mul=(a,b)=>f(a*b),div=(a,b)=>f(a/b),sqrt=x=>f(Math.sqrt(x));
const norm=(x,y)=>sqrt(add(mul(x,x),mul(y,y)));
function finiteArray(input,length,name){if(!input||input.length!==length)throw new TypeError(`${name} requires ${length} FLOATs`);const out=Float32Array.from(input);if(out.some(x=>!Number.isFinite(x)))throw new TypeError(`${name} requires finite FLOATs`);return out;}
function hermite13(input){
 const p=finiteArray(input,10,'controls5'),coef=new Float32Array(12),out=new Float32Array(26),step=div(c(0x148e19460),3);
 for(let i=1;i<=3;i++){
  const t=mul(i,step),t2=mul(t,t),t3=mul(t,t2),twot3=add(t3,t3),threet2=mul(t2,c(0x148e5b520));
  coef.set([add(sub(twot3,threet2),1),sub(threet2,twot3),add(sub(t3,add(t2,t2)),t),sub(t3,t2)],(i-1)*4);
 }
 out.set(p.subarray(0,2),0);
 for(let j=0;j<4;j++)for(let i=0;i<3;i++)for(let axis=0;axis<2;axis++){
  const a=p[j*2+axis],b=p[(j+1)*2+axis];
  const m0=mul(sub(p[(j+1)*2+axis],p[(j===0?0:j-1)*2+axis]),.5);
  const m1=mul(sub(p[(j===3?4:j+2)*2+axis],p[j*2+axis]),.5);
  const h=coef.subarray(i*4,i*4+4);
  let y=add(mul(h[1],b),mul(h[0],a));y=add(y,mul(h[2],m0));y=add(y,mul(h[3],m1));
  out[(1+j*3+i)*2+axis]=y;
 }
 return {points:out,coefficients:coef};
}
function gateClose(expandedInput,controlsInput,upperInput,lowerInput,side){
 const e=finiteArray(expandedInput,828,'expanded414'),p=finiteArray(controlsInput,10,'controls5'),u=finiteArray(upperInput,26,'upper13'),l=finiteArray(lowerInput,26,'lower13');
 if(side!==0&&side!==1)throw new TypeError('side requires 0 or 1');
 const k=side?7:17,midX=mul(add(e[k*2],e[(k+1)*2]),.5),midY=mul(add(e[k*2+1],e[(k+1)*2+1]),.5);
 const orientCross=sub(mul(sub(midY,p[1]),sub(p[8],p[0])),mul(sub(midX,p[0]),sub(p[9],p[1]))),orientation=values.get('0x1490290d8')[orientCross<0?1:0];
 const trace={orientationCross:orientCross,orientation,acos:[],samples:[],reason:null};
 const done=reason=>{trace.reason=reason;return {flag:1,trace};};
 for(let i=1;i<12;i++){
  const item={index:i,anchors:[]};trace.samples.push(item);
  for(let anchor=0;anchor<2;anchor++){
   const offset=anchor?8:0,ux=sub(u[i*2],p[offset]),uy=sub(u[i*2+1],p[offset+1]),lx=sub(l[i*2],p[offset]),ly=sub(l[i*2+1],p[offset+1]);
   const cross=sub(mul(ux,ly),mul(uy,lx)),signed=mul(orientation,cross),entry={anchor,cross,signed};item.anchors.push(entry);
   if(anchor===0?signed<0:signed>0)return done(`orientation-${anchor}-${i}`);
   if(Math.abs(cross)<c(0x148e19480))return done(`cross-epsilon-${anchor}-${i}`);
   const cosine=div(div(add(mul(ux,lx),mul(uy,ly)),norm(ux,uy)),norm(lx,ly));
   // Finite production scope rejects unproved acosf errno/domain paths; no clamp changes original geometry.
   const radians=bundledAcosfCandidate(cosine),degree=div(mul(radians,c(0x148fb0338)),c(0x149148708));
   Object.assign(entry,{cosine,radians,degree});trace.acos.push({inputBits:bits(cosine),outputBits:bits(radians)});
   if(degree<c(0x148eea150)&&(anchor===0?i<6:i>6))return done(`angle-${anchor}-${i}`);
  }
  if(i>=3&&i<=9){const distance=norm(sub(u[i*2],l[i*2]),sub(u[i*2+1],l[i*2+1]));item.distance=distance;if(distance<=c(0x148e2f4c4))return done(`distance-${i}`);}
 }
 trace.reason='open';return {flag:0,trace};
}
function classifyClose(rawInput,expandedInput){
 const p=finiteArray(rawInput,388,'raw194'),e=finiteArray(expandedInput,828,'expanded414');
 const distance=(a,b)=>norm(sub(p[a*2],p[b*2]),sub(p[a*2+1],p[b*2+1]));
 const ratios=[div(distance(24,20),add(distance(22,18),c(0x148e2f52c))),div(distance(42,38),add(distance(40,36),c(0x148e2f52c)))];
 const trace={ratios,hermite:[],gates:[],acos:[]};const flags=[];
 for(let n=0;n<2;n++){
  const side=1-n;if(ratios[n]>c(0x148fda75c)){flags[n]=0;continue;}
  const upperIndices=side?[18,19,20,21,22]:[40,39,38,37,36],lowerIndices=side?[18,25,24,23,22]:[40,41,42,43,36];
  const select=indices=>Float32Array.from(indices.flatMap(i=>[p[i*2],p[i*2+1]]));
  const controls=select(upperIndices),lowerControls=select(lowerIndices),upper=hermite13(controls),lower=hermite13(lowerControls);
  for(const [control,curve] of [[controls,upper],[lowerControls,lower]])trace.hermite.push({controlsBits:Array.from(control,bits),count:5,sampleCount:13,tensionBits:bits(.5),subdiv:3,outputBits:Array.from(curve.points,bits),coefficientBits:Array.from(curve.coefficients,bits)});
  const result=gateClose(e,controls,upper.points,lower.points,side);flags[n]=result.flag;
  trace.gates.push({orientationBits:[bits(result.trace.orientationCross),bits(result.trace.orientation)],side,controlsBits:Array.from(controls,bits),upperBits:Array.from(upper.points,bits),lowerBits:Array.from(lower.points,bits),flag:result.flag,acosStart:trace.acos.length,acosEnd:trace.acos.length+result.trace.acos.length,details:result.trace});trace.acos.push(...result.trace.acos);
 }
 return {left:flags[0],right:flags[1],trace};
}
function updateCloseCache(ownerFace){
 if(!(ownerFace instanceof Uint8Array)||ownerFace.byteLength<0x18ab)throw new TypeError('ownerFace requires BYTE view through +0x18aa');
 if(ownerFace[0x18aa]!==0||ownerFace[0x1698]!==1||ownerFace[0x1699]!==1)return {updated:false,left:ownerFace[0x18a8],right:ownerFace[0x18a9],ready:ownerFace[0x18aa]};
 const d=new DataView(ownerFace.buffer,ownerFace.byteOffset,ownerFace.byteLength);const read=(offset,n)=>Float32Array.from({length:n},(_,i)=>d.getFloat32(offset+i*4,true));
 const out=classifyClose(read(8,388),read(0x924,828));ownerFace[0x18a8]=out.left;ownerFace[0x18a9]=out.right;ownerFace[0x18aa]=1;
 return {updated:true,left:out.left,right:out.right,ready:1,trace:out.trace};
}
function closeEyes(raw194,expanded414,options={}){
 const {rawReady=1,expandedReady=1,cacheReady=0,left=0,right=0}=options;
 for(const x of [rawReady,expandedReady,cacheReady,left,right])if(!Number.isInteger(x)||x<0||x>255)throw new TypeError('ready/cache and prior flags require BYTE values');
 if(cacheReady!==0||rawReady!==1||expandedReady!==1)return {updated:false,left,right,ready:cacheReady};
 const result=classifyClose(raw194,expanded414);return {updated:true,left:result.left,right:result.right,ready:1};
}
export {closeEyes,hermite13,gateClose,classifyClose,updateCloseCache,bits,fromBits,constants};
