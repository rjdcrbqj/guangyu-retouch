'use strict';
const {PublicHairEffectService}=require('../public-hair-effect-service.cjs');
const {whiteHairSettings}=require('./core.cjs');
class PublicWhiteHairService extends PublicHairEffectService{
 constructor(dependencies){super({label:'去白发',backend:'public-white-hair-repigment',settings:whiteHairSettings,worker:require.resolve('./worker.cjs')},dependencies);}
}
module.exports={PublicWhiteHairService};
