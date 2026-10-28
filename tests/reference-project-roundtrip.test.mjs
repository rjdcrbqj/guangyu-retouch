import test from 'node:test';import assert from 'node:assert/strict';
import {validateProject} from '../src/model.js';
import {projectPhotoRecord,restoreProjectPhoto} from '../src/project-photo.js';
import {normalizeReferenceState,snapshotReference} from '../src/reference-skin-state.js';

// 完整项目级往返：projectPhotoRecord -> validateProject -> restoreProjectPhoto -> makePhoto。
// 关键点：pickPoint 必须在整个链路中存活，否则 phase69 的"重开后能再次应用"在项目级会失效。

function fakePhoto(over={}){
 return {name:'a.png',original:'data:image/png;base64,AAAA',
  params:{},skin:{toDataURL:()=>'data:image/png;base64,BBBB'},teeth:{toDataURL:()=>'data:image/png;base64,CCCC'},
  ai:{toDataURL:()=>'data:image/png;base64,DDDD'},aiPoints:[],nativeTeethFaces:[],brightEyeFaces:[],
  skinReference:null,...over};
}

test('pickPoint survives the full project save->validate->restore round trip',()=>{
 const photo=fakePhoto({skinReference:normalizeReferenceState({
  image:'data:image/png;base64,'+Buffer.from('x'.repeat(20)).toString('base64'),width:64,height:64,rect:null,pickPoint:[100,80],revision:3})});
 // 1) save
 const record=projectPhotoRecord(photo);
 assert.deepEqual(Array.from(record.skinReference.pickPoint),[100,80],'保存时pickPoint必须保留');
 // 2) validate (as open-project does)
 const project=validateProject({version:1,photos:[record]});
 assert.deepEqual(Array.from(project.photos[0].skinReference.pickPoint),[100,80],'校验后pickPoint必须保留');
 // 3) restore (as open-project does)
 let receivedRef=null;
 restoreProjectPhoto(project.photos[0],(name,original,params,skinMask,teethMask,aiMask,aiPoints,nativeTeethFaces,brightEyeFaces,skinReference)=>{
  receivedRef=snapshotReference(skinReference);
  return {probe:true};
 });
 assert.deepEqual(Array.from(receivedRef.pickPoint),[100,80],'恢复时pickPoint必须保留');
});

test('a cleared reference stays cleared through the round trip',()=>{
 const photo=fakePhoto({skinReference:null});
 const record=projectPhotoRecord(photo);
 assert.equal(record.skinReference,null);
 const project=validateProject({version:1,photos:[record]});
 assert.equal(project.photos[0].skinReference,null);
});
