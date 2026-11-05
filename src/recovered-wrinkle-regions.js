import regions from './wrinkle-region-contract.js';
export const wrinkleRegions=Object.freeze(regions.map(r=>Object.freeze({...r,slots:Object.freeze(r.slots)})));
export const wrinkleSpecs=Object.freeze([
 {key:'wrinkleMode',label:'祛皱模式',min:0,max:1,step:1,default:0,group:'wrinkle'},
 {key:'wrinkleStrength',label:'整体祛皱强度',min:0,max:100,step:1,default:50,group:'wrinkle'},
 ...wrinkleRegions.map(r=>({key:r.key,label:r.label,min:0,max:100,step:1,default:0,group:'wrinkle'}))
]);
export function wrinkleOptionsFromParams(params){
 if(![0,1].includes(params.wrinkleMode))throw new Error('祛皱模式无效');
 return params.wrinkleMode===1?{regionsPercent:Object.fromEntries(wrinkleRegions.map(r=>[r.flag,params[r.key]]))}:{strength:params.wrinkleStrength/100};
}
