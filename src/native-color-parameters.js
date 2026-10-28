import {getTempTintConstants} from './recovered-native-color.js';
// Complete recovered finite table arithmetic. Explicit 24 F32 [-1,1] controls.
// No original cell/UI, table texture upload, ICC or effect-stack claim.
const f=Math.fround,nodes=[0,30,55,95,160,230,275,330],positive=[30,30,36,58.5,63,40.5,49.5,30],negative=[30,30,30,36,58.5,63,40.5,49.5];
export function createHSLTables(input){
 if(!(input instanceof Float32Array)||input.length!==24||input.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw new Error('Explicit 24 finite F32 controls in [-1,1] required');
 const hue=input.slice(0,8);const scaled=Array.from(hue,(v,i)=>v*(v<0?negative[i]:positive[i])/60);
 const interpolate=values=>{const result=new Float32Array(74);let left=0;for(let i=0;i<72;i++){const x=i*5;while(left<7&&x>=nodes[left+1])left++;const right=(left+1)%8,end=right?nodes[right]:360;result[i]=(values[right]-values[left])*((x-nodes[left])/(end-nodes[left]))+values[left];}result[72]=result[0];result[73]=result[1];return result;};
 const h=interpolate(scaled),shift=h[0]<0?6:0,step=f(1/12);for(let i=0;i<74;i++)h[i]=h[i]+(i*step+shift);
 return {hue:h,saturation:interpolate(input.subarray(8,16)),luma:interpolate(input.subarray(16,24))};
}


export function createTempTintParameters(degree0,degree1){
 const degree=[degree0,degree1].map(v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw new RangeError('explicit finite degree [0,1] required');return f(v);});
 const {gains,matrices}=getTempTintConstants(),indices=degree.map(v=>Math.trunc((v+0.000001)/0.05)),j=indices[0]*63+indices[1]*3;
 const selected=new Float32Array(12);[0,3,63,66].forEach((off,n)=>selected.set(gains.subarray(j+off,j+off+3),n*3));
 const mi=indices[0]*189+indices[1]*9,matrix=matrices.slice(mi,mi+9),weights=degree.map(v=>{const p=f(v*20);return f(p-Math.floor(p));});
 return {degree,indices,gains:selected,matrix,weights};
}
// Explicit APP relative ranges, not recovered original UI units.
export function hslControlsFromParams(p){return new Float32Array(['Hue','Saturation','Luma'].flatMap(type=>Array.from({length:8},(_,i)=>p['hsl'+type+i]/100)));}
export function tempTintDegreeFromParams(p){return [f(p.relativeTemperature/200+.5),f(p.relativeTint/200+.5)];}
