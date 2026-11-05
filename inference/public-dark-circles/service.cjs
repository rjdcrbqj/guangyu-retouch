"use strict";
const {PublicUnderEyeService}=require('../public-under-eye/service.cjs'),{underEyeRegion}=require('./geometry.cjs'),{correctUnderEye}=require('./core.cjs'),{fromUI,handlerControls}=require('../dark-circles-strength.cjs');
const workflow={label:'祛黑眼圈',backend:'public-under-eye-colour',controls:options=>{const c=handlerControls(fromUI(options));if(!c.enabled)throw Error('祛黑眼圈强度为零，无需处理');return c;},region:underEyeRegion,correct:correctUnderEye,weight:(u,v)=>v>0&&(u/.55)**2+((v-.28)/.28)**2<1?1:0,allowDarkening:false};
class PublicDarkCirclesService extends PublicUnderEyeService{constructor(dependencies={}){super({...dependencies,workflow});}}
module.exports={PublicDarkCirclesService};
