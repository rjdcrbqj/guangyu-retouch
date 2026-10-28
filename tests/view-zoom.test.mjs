import test from 'node:test';
import assert from 'node:assert/strict';
import {nextZoomPercent,anchorScrollDelta} from '../src/view-zoom.js';

test('滚轮向上放大、向下缩小，并限制在5%至400%',()=>{
 assert.equal(nextZoomPercent(100,'in'),125);
 assert.equal(nextZoomPercent(125,'out'),100);
 assert.equal(nextZoomPercent(71,'in'),75);
 assert.equal(nextZoomPercent(71,'out'),67);
 assert.equal(nextZoomPercent(5,'out'),5);
 assert.equal(nextZoomPercent(400,'in'),400);
});

test('缩放后的滚动补偿保持鼠标下的图片坐标',()=>{
 const before={left:10,top:20,width:400,height:200};
 const after={left:-30,top:-80,width:800,height:400};
 const pointer={x:110,y:70};
 const delta=anchorScrollDelta(before,after,pointer);
 assert.deepEqual(delta,{x:60,y:-50});
 assert.equal((pointer.x-(after.left-delta.x))/after.width,(pointer.x-before.left)/before.width);
 assert.equal((pointer.y-(after.top-delta.y))/after.height,(pointer.y-before.top)/before.height);
});
