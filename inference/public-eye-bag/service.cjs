"use strict";
const {PublicUnderEyeService}=require('../public-under-eye/service.cjs'),{underEyeRegion}=require('../public-dark-circles/geometry.cjs'),{correctEyeBag,bagWeight}=require('./core.cjs'),{fromUI,handlerControls}=require('../eye-bag-strength.cjs');
const workflow={label:'去眼袋',backend:'public-eye-bag-contour',controls:options=>{const c=handlerControls(fromUI(options||{}));if(!c.primaryEnabled)throw Error('请先增加去眼袋强度');return {strength:c.primaryStrength,keep:c.secondaryStrength};},region:(face,side)=>underEyeRegion(face,side,{referenceBottom:1.85}),correct:correctEyeBag,weight:(u,v,c)=>bagWeight(u,v,c.keep),allowDarkening:true};
class PublicEyeBagService extends PublicUnderEyeService{constructor(dependencies={}){super({...dependencies,workflow});}}
module.exports={PublicEyeBagService};
