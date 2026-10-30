import test from 'node:test';
import assert from 'node:assert/strict';
import {History,normalizeParams,validateProject} from '../src/model.js';
import {projectPhotoRecord,restoreProjectPhoto,projectFormatVersion} from '../src/project-photo.js';
const image='data:image/png;base64,AA==',output='data:image/png;base64,AQ==';
const effects={version:1,stages:[{kind:'dark-circles',options:{strengthPercent:40}}],image:output};
const state={params:normalizeParams({darkCirclesStrength:40}),skin:image,teeth:image,ai:image,aiPoints:[],nativeTeethFaces:[],brightEyeFaces:[],skinReference:null,effects};
test('AI 结果和配方随工程及历史恢复，原图不被替换',async()=>{
 const history=new History({...state,effects:undefined});history.push(state);
 const p={name:'a.png',original:image,...state,history,skin:{toDataURL:()=>image},teeth:{toDataURL:()=>image},ai:{toDataURL:()=>image}};
 const saved=projectPhotoRecord(p),checked=validateProject({version:1,photos:[saved]}).photos[0];
 assert.deepEqual(checked.effects,effects);assert.equal(checked.original,image);assert.deepEqual(checked.history.items[1].effects,effects);
 let args;await restoreProjectPhoto(checked,async(...values)=>{args=values;return {};});assert.deepEqual(args[10],effects);
 assert.equal(History.fromRecord(checked.history).undo().effects,undefined);
});
test('不接受外部效果图像或历史与当前效果不一致',()=>{
 const p={name:'a.png',original:image,params:{},effects:{...effects,image:'https://example.invalid/private.png'}};
 assert.throws(()=>validateProject({version:1,photos:[p]}),/效果/);
});
test('含 AI 图像或 AI 撤销历史时使用新版工程标记，避免旧程序忽略效果',()=>{
 assert.equal(projectFormatVersion([{history:new History({params:{}})}]),1);
 assert.equal(projectFormatVersion([{effects}]),2);
 assert.equal(projectFormatVersion([{history:new History({effects})}]),2);
 assert.equal(validateProject({version:2,photos:[{name:'a.png',original:image,effects}]}).version,2);
});
