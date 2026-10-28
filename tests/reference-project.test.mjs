import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProject} from '../src/model.js';
let adapter;try{adapter=await import('../src/project-photo.js');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const image='data:image/png;base64,iVBORw0KGgo=';
const reference={mode:'single',image,width:64,height:64,rect:[1,2,20,30],revision:7};
const canvas=()=>({toDataURL:()=>image});
const photo=()=>({name:'portrait.png',original:image,params:{exposure:1},skin:canvas(),teeth:canvas(),ai:canvas(),nativeTeethFaces:[],brightEyeFaces:[],aiPoints:[],skinReference:{...reference,rect:reference.rect.slice()}});

test('actual save record retains independent reference and existing photo fields',()=>{
 assert.equal(typeof adapter?.projectPhotoRecord,'function','project save adapter is missing');
 const p=photo(),record=adapter.projectPhotoRecord(p);
 p.skinReference.rect[0]=9;
 const restored=validateProject(JSON.parse(JSON.stringify({version:1,photos:[record]}))).photos[0];
 assert.deepEqual(restored.skinReference,reference);
 assert.equal(restored.name,p.name);assert.equal(restored.original,image);
 assert.equal(restored.params.exposure,1);
 assert.equal(restored.skinMask,image);assert.equal(restored.teethMask,image);assert.equal(restored.aiMask,image);
 assert.deepEqual(restored.nativeTeethFaces,[]);assert.deepEqual(restored.brightEyeFaces,[]);assert.deepEqual(restored.aiPoints,[]);
});

test('actual restore adapter supplies reference snapshot in factory argument10 before await',async()=>{
 assert.equal(typeof adapter?.restoreProjectPhoto,'function','project restore adapter is missing');
 const record=adapter.projectPhotoRecord(photo());let args,release;
 const factory=(...values)=>{args=values;return new Promise(resolve=>{release=resolve;});};
 const pending=adapter.restoreProjectPhoto(record,factory);
 assert.equal(args.length,10);assert.equal(args[0],record.name);assert.equal(args[1],image);
 assert.equal(args[3],record.skinMask);assert.equal(args[4],record.teethMask);assert.equal(args[5],record.aiMask);
 assert.deepEqual(args[6],[]);assert.deepEqual(args[7],[]);assert.deepEqual(args[8],[]);
 assert.deepEqual(args[9],reference);assert.notEqual(args[9],record.skinReference);
 assert.ok(Object.isFrozen(args[9]));assert.ok(Object.isFrozen(args[9].rect));
 release({skinReference:args[9]});assert.deepEqual((await pending).skinReference,reference);
});

test('legacy and cleared reference restore without resurrecting prior selection',async()=>{
 assert.equal(typeof adapter?.restoreProjectPhoto,'function','project restore adapter is missing');
 const factory=(...args)=>({skinReference:args[9]});
 const old={name:'old.png',original:image,params:{}};
 assert.equal((await adapter.restoreProjectPhoto(old,factory)).skinReference,null);
 const cleared={mode:'single',image:null,width:0,height:0,rect:null,revision:8};
 assert.deepEqual((await adapter.restoreProjectPhoto({...old,skinReference:cleared},factory)).skinReference,cleared);
 assert.throws(()=>adapter.restoreProjectPhoto({...old,skinReference:{...reference,rect:[100,0,1,1]}},factory));
});
