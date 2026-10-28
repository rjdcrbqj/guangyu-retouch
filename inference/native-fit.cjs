'use strict';
const {meansAndCovariance,meansAndCovarianceSelected5,svd2,determinantOriginal}=require('./native-fit-core.cjs');
const {fitPost}=require('./native-fit-post.cjs');
// 原1444fbf90的固定二维F32操作顺序；受控原函数夹具逐位验证。
// 仅5/33/142/194等行有限坐标；不代表原应用的检测、选脸或数学运行时已完全对齐。
function solve(pre){
 const svd=svd2(pre.covariance);
 const {affine}=fitPost({...pre,...svd,determinantOriginal});
 if(!affine.flat().every(Number.isFinite))throw new RangeError('关键点退化，无法配准');
 return affine;
}
function nativeSimilarity(source,target){return solve(meansAndCovariance(source,target));}
// 原14450d080选点结果为对齐column-major，1445072d0均值顺序独立于equal5。
function nativeSelected5Similarity(source,target){return solve(meansAndCovarianceSelected5(source,target));}
module.exports={nativeSimilarity,nativeSelected5Similarity};
