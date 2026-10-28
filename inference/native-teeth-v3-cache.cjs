'use strict';
const F=Math.fround,SIDE=384,AREA=SIDE*SIDE;
function dimensions(v){return Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>0)&&v[0]*v[1]<=80000000;}
function six(v){return Array.isArray(v)&&v.length===6&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(F(n)));}
function adaptSavedInverse(savedSix,savedSourceWH,targetWH=savedSourceWH){
 if(!six(savedSix)||!dimensions(savedSourceWH)||!dimensions(targetWH))throw Error('原牙齿投影数据无效');
 const rx=F(F(targetWH[0])/F(savedSourceWH[0])),ry=F(F(targetWH[1])/F(savedSourceWH[1]));
 const result=savedSix.map((v,i)=>F(F(v)*(i<3?rx:ry)));
 if(!result.every(Number.isFinite)||result[0]*result[4]-result[1]*result[3]===0)throw Error('原牙齿投影矩阵退化');
 return result;
}
function createNativeTeethCache({plane9,plane10,inverse,sourceWH,targetWH=sourceWH}={}){
 if(!(plane9 instanceof Uint8Array)||!(plane10 instanceof Uint8Array)||plane9.length!==AREA||plane10.length!==AREA)throw Error('原牙齿平面尺寸无效');
 const podSix=adaptSavedInverse(inverse,sourceWH,targetWH),rgba=Buffer.alloc(AREA*4);
 // 原21-plane adapter selects slot9/10 and clears each of their four borders twice before POD storage.
 // Plane copies here leave the separately displayed legacy selection and the original inference output unchanged.
 for(let i=0;i<AREA;i++){const edge=i<SIDE||i>=AREA-SIDE||i%SIDE===0||i%SIDE===SIDE-1;rgba[i*4]=edge?0:plane9[i];rgba[i*4+1]=edge?0:plane10[i];rgba[i*4+3]=255;}
 return {format:'guangyu-native-teeth-v3-face',version:1,sourceWH:[...targetWH],maskWH:[SIDE,SIDE],podSixBits:Array.from(new Uint32Array(Float32Array.from(podSix).buffer)),rgbaBase64:rgba.toString('base64')};
}
module.exports={adaptSavedInverse,createNativeTeethCache};
