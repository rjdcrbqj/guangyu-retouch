import {nativeTeethSpecs} from './recovered-native-teeth.js';
import {brightEyeSpecs} from './bright-eye-parameters.js';
import {nativeColorSpecs} from './recovered-native-color.js';
import {vignetteSpecs} from './recovered-vignette.js';
import {adjustmentSpecs} from './recovered-adjustments.js';
import {finishingParamSpecs} from './recovered-finishing.js';
import {wrinkleSpecs} from './recovered-wrinkle-regions.js';
export const BULK_SPECS=Object.freeze([...nativeTeethSpecs,...brightEyeSpecs,...wrinkleSpecs,{key:'skinUnifyStrength',label:'肤色统一强度',min:0,max:100,step:1,default:0,group:'unify'},{key:'lipWrinkleStrength',label:'唇纹强度',min:0,max:100,step:1,default:0,group:'lip'},{key:'eyeBagStrength',label:'去眼袋强度',min:0,max:100,step:1,default:0,group:'eyes'},{key:'eyeBagKeep',label:'卧蚕保留',min:0,max:100,step:1,default:100,group:'eyes'},{key:'darkCirclesStrength',label:'祛黑眼圈强度',min:0,max:100,step:1,default:0,group:'eyes'},...adjustmentSpecs,...nativeColorSpecs,...vignetteSpecs,...finishingParamSpecs,{key:'finishingScope',label:'细节作用范围',min:0,max:1,step:1,default:0,group:'local'}]);
export const BULK_DEFAULTS=Object.freeze(Object.fromEntries(BULK_SPECS.map(s=>[s.key,s.default])));
