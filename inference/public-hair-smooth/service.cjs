'use strict';
const {PublicHairEffectService}=require('../public-hair-effect-service.cjs');
const {hairSettings}=require('./core.cjs');
class PublicHairSmoothService extends PublicHairEffectService{
 constructor(dependencies){super({label:'发丝柔顺',backend:'public-directional-hair-smooth',settings:hairSettings,worker:require.resolve('./worker.cjs')},dependencies);}
}
module.exports={PublicHairSmoothService};
