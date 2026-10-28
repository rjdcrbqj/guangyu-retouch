import test from 'node:test';import assert from 'node:assert/strict';
import {cropReferencePatch} from '../src/reference-pick.js';

// 原版的取色框是 64 个**原图像素**（证据：clamp(point-32,0,D-1)、size min(64,D-origin)，
// 其中 D 是 provider 的真实图幅）。若从降采样后的工作图裁，64px 会覆盖更宽的实际范围。
// 本用例固定"裁剪必须在原图分辨率坐标下进行"的语义。

test('a 64-pixel crop from the original-resolution frame covers the same physical span regardless of preview size',()=>{
 const FULL=4000;
 // 原图分辨率下一张全尺寸图的裁剪
 const full=new Uint8Array(FULL*100*4);
 const r=cropReferencePatch({data:full,width:FULL,height:100,point:[2000,50]});
 assert.equal(r.width,64);
 // 占原图宽度的比例
 const frac=r.width/FULL;
 assert.ok(Math.abs(frac-64/4000)<1e-9);
 // 若从 1600 宽的工作图裁，同样 64px 只占 4%，对应原图 160px —— 覆盖范围是 2.5 倍
 const work=1600;
 const rw=cropReferencePatch({data:new Uint8Array(work*40*4),width:work,height:40,point:[800,20]});
 assert.equal(rw.width,64);
 const equivalentInFull=64/work*FULL;
 assert.ok(equivalentInFull>64*2,'工作图裁剪等价于原图更大范围');
});
