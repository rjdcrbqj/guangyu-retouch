import test from 'node:test';
import assert from 'node:assert/strict';
import {History,validateProject,normalizeParams} from '../src/model.js';
import {projectPhotoRecord,restoreProjectPhoto} from '../src/project-photo.js';
const image='data:image/png;base64,AA==';
const state=exposure=>({params:normalizeParams({exposure}),skin:image,teeth:image,ai:image,aiPoints:[],nativeTeethFaces:[],brightEyeFaces:[],skinReference:null});
function photo(){const p={name:'a.png',original:image,...state(.25),skin:{toDataURL:()=>image},teeth:{toDataURL:()=>image},ai:{toDataURL:()=>image}};p.history=new History(state(0));p.history.push(state(.25));return p;}
test('保存和重新打开工程后仍能撤销、重做参数',async()=>{
 const p=photo();const saved=projectPhotoRecord(p);const validated=validateProject({version:1,photos:[saved]});
 const restored=await restoreProjectPhoto(validated.photos[0],async()=>({history:new History(state(.25))}));
 assert.equal(restored.history.canUndo,true);assert.equal(restored.history.undo().params.exposure,0);assert.equal(restored.history.redo().params.exposure,.25);
 p.history.undo();const copy=History.fromRecord(p.history.toRecord());assert.equal(copy.canRedo,true);copy.redo();assert.equal(p.history.index,0);
});
test('旧工程仍能打开；损坏的历史不能绕过工程图像和参数检查',()=>{
 const saved=projectPhotoRecord(photo());delete saved.history;assert.equal(validateProject({version:1,photos:[saved]}).photos.length,1);
 for(const history of [{index:8,items:[state(.25)]},{index:0,items:[{...state(.25),skin:'file:///secret.png'}]},{index:0,items:[state(1)]}]){
  assert.throws(()=>validateProject({version:1,photos:[{...saved,history}]}),/历史/);
 }
});
test('滑杆尚未提交时保存也得到可重开的工程，不修改现有历史分支',()=>{
 const p=photo();p.params.exposure=.75;
 const saved=projectPhotoRecord(p),validated=validateProject({version:1,photos:[saved]}).photos[0];
 assert.equal(validated.history.items.at(-1).params.exposure,.75);
 assert.equal(p.history.current.params.exposure,.25);
 const history=History.fromRecord(validated.history);assert.equal(history.undo().params.exposure,.25);
});
