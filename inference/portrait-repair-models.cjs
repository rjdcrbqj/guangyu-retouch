'use strict';
const path=require('node:path');
const {OriginalPortraitRepair}=require('./assets/portrait-repair/repair-backend.cjs');
const manifest=require('./assets/portrait-repair-corrected/manifest.json');
class CorrectedPortraitRepair extends OriginalPortraitRepair{
 constructor({modelDirectory=path.join(__dirname,'assets','portrait-repair-corrected'),...options}={}){super({modelDirectory,...options});}
 model(role){if(!Object.hasOwn(manifest.models,role))throw new Error(`Unsupported original repair model: ${role}`);return manifest.models[role];}
}
module.exports={CorrectedPortraitRepair,manifest};
