import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProject} from '../src/model.js';
let state;try{state=await import('../src/reference-skin-state.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const image='data:image/png;base64,iVBORw0KGgo=';
const chosen={image,width:512,height:256,rect:[3,4,50,60]};

test('select and clear retain revisions and independent immutable job snapshots',()=>{
 assert.equal(typeof state?.replaceReference,'function','reference state is missing');
 assert.equal(state.normalizeReferenceState(undefined),null);
 const first=state.replaceReference(null,chosen),job=state.snapshotReference(first);
 assert.equal(first.mode,'single');assert.equal(first.revision,1);
 assert.deepEqual(job.rect,[3,4,50,60]);first.rect[0]=4;
 assert.equal(job.rect[0],3);assert.ok(Object.isFrozen(job));assert.ok(Object.isFrozen(job.rect));
 const second=state.replaceReference(first,{...chosen,rect:null});assert.equal(second.revision,2);assert.equal(second.rect,null);
 const cleared=state.clearReference(second);assert.equal(cleared.image,null);assert.equal(cleared.revision,3);
 assert.deepEqual(state.normalizeReferenceState(cleared),cleared);assert.equal(state.snapshotReference(null),null);
});

test('invalid external paths, rectangles and revisions are rejected',()=>{
 assert.equal(typeof state?.normalizeReferenceState,'function','reference state is missing');
 for(const patch of [{image:'file:///private.png'},{image:'data:image/svg+xml;base64,AAAA'},
  {width:0},{height:1.5},{width:32767},{width:32766,height:32766},
  {rect:[-1,0,5,5]},{rect:[500,0,30,5]},{rect:[0,0,5,0]},{rect:[0,0,5.5,5]},
  {revision:-1},{revision:1.5},{mode:'class-map'}]){
  assert.throws(()=>state.normalizeReferenceState({...chosen,mode:'single',revision:1,...patch}));
 }
 assert.throws(()=>state.replaceReference({...chosen,mode:'single',revision:Number.MAX_SAFE_INTEGER},chosen));
});

test('legacy projects restore without reference and new project state survives JSON roundtrip',()=>{
 const old={version:1,photos:[{name:'portrait.png',original:image}]};
 assert.equal(validateProject(old).photos[0].skinReference,null,'legacy defaults to no reference');
 assert.equal(typeof state?.replaceReference,'function','reference state is missing');
 const selected=state.replaceReference(null,chosen),project={version:1,photos:[{...old.photos[0],skinReference:selected}]};
 const result=validateProject(JSON.parse(JSON.stringify(project)));
 assert.deepEqual(result.photos[0].skinReference,selected);
 assert.equal(result.photos[0].name,'portrait.png');assert.equal(result.photos[0].original,image);
 selected.rect[0]=7;assert.equal(result.photos[0].skinReference.rect[0],3,'project validator owns nested rectangles');
 assert.throws(()=>validateProject({version:1,photos:[{...old.photos[0],skinReference:{...selected,image:'C:/secret.png'}}]}));
});
