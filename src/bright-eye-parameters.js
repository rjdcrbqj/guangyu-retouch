const F=Math.fround;
export const brightEyeSpecs=Object.freeze(['Left','Right'].flatMap((side,index)=>[
 {key:`brightEye${side}Master`,label:'总强度',min:0,max:100,step:1,default:0,group:'eyes'},
 {key:`brightEye${side}White`,label:'眼白',min:0,max:100,step:1,default:80,group:'eyes'},
 {key:`brightEye${side}Other`,label:'瞳孔',min:0,max:100,step:1,default:80,group:'eyes'},
 {key:`brightEye${side}High`,label:'高光',min:0,max:100,step:1,default:40,group:'eyes'}
]));
// Original four FLOAT transport and fixed SharpFactor/HighlightFactor/Saturation.
export function brightEyeUniforms(degrees){
 if(!Array.isArray(degrees)||degrees.length!==4||!degrees.every(x=>Number.isFinite(x)&&Number.isFinite(F(x))))throw Error('亮眼强度无效');
 const [master,white,other,high]=degrees.map(F);
 return {master,white,other,sharp:F(other*F(.66)),high:F(high*F(1.79)),saturation:F(.51)};
}
// UI percentages are the original separate 0..100 /100 convention.
// Demographic/context factors are explicitly 1 in this independent application.
export function brightEyeWeights(params,side){
 if(side!==0&&side!==1)throw Error('亮眼侧别无效');
 const name=side?'Left':'Right',degrees=['Master','White','Other','High'].map(key=>F(Number(params[`brightEye${name}${key}`]??0)/100));
 const values=brightEyeUniforms(degrees);return {...values,active:values.master>0};
}
export const brightEyeFloatValues=bits=>new Float32Array(Uint32Array.from(bits).buffer);
export function decodeBrightEyeHighlight(side){
 const raw=atob(side.highlightBase64),out=new Uint8Array(160000);
 for(let i=0;i<40000;i++){const value=raw.charCodeAt(i);out[4*i]=out[4*i+1]=out[4*i+2]=value;out[4*i+3]=255;}
 return out;
}
export function decodeBrightEyeExtra(extra){
 const raw=atob(extra.plane3Base64),out=new Uint8Array(256*256*4);for(let i=0;i<65536;i++)out[i*4+1]=raw.charCodeAt(i);return out;
}
function validateExtra(extra){
 if(!extra||typeof extra.plane3Base64!=='string'||extra.plane3Base64.length!==87384||!/^[A-Za-z0-9+/]+==$/.test(extra.plane3Base64)||atob(extra.plane3Base64).length!==65536)throw Error('亮眼眼部遮罩缓存无效');
 for(const key of ['projectionBits','normalizedBits'])if(!Array.isArray(extra[key])||extra[key].length!==9||!extra[key].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)||!brightEyeFloatValues(extra[key]).every(Number.isFinite))throw Error('亮眼遮罩投影缓存无效');
 const p=brightEyeFloatValues(extra.projectionBits),n=brightEyeFloatValues(extra.normalizedBits);if(p[2]!==0||p[5]!==0||p[8]!==1||n[6]!==0||n[7]!==0||n[8]!==1)throw Error('亮眼遮罩仿射缓存无效');
 return {plane3Base64:extra.plane3Base64,projectionBits:[...extra.projectionBits],normalizedBits:[...extra.normalizedBits]};
}
export function validateBrightEyeFaces(faces,{sourceWH}={}){
 if(faces===undefined)return [];
 if(!Array.isArray(faces)||faces.length>8)throw Error('亮眼人脸缓存数量无效');
 if(faces.some(face=>face?.version!==faces[0]?.version))throw Error('亮眼人脸缓存版本不一致');
 const checked=faces.map(face=>{
  if(!face||face.format!=='guangyu-bright-eye-face'||![1,2].includes(face.version)||!Array.isArray(face.sourceWH)||face.sourceWH.length!==2||!face.sourceWH.every(x=>Number.isSafeInteger(x)&&x>0&&x<=32768)||face.sourceWH[0]*face.sourceWH[1]>80000000)throw Error('亮眼照片缓存无效');
  if(face.version===1&&face.extra!==undefined)throw Error('旧亮眼缓存包含不匹配的眼部遮罩');
  const extra=face.version===2?validateExtra(face.extra):null;
  if(sourceWH&&(face.sourceWH[0]!==sourceWH[0]||face.sourceWH[1]!==sourceWH[1]))throw Error('亮眼缓存与照片尺寸不匹配');
  if(!Array.isArray(face.sides)||face.sides.length>2)throw Error('亮眼眼区缓存无效');
  const seen=new Set(),sides=face.sides.map(side=>{
   if(!side||![0,1].includes(side.side)||seen.has(side.side)||typeof side.closed!=='boolean')throw Error('亮眼侧别缓存无效');seen.add(side.side);
   if(!Array.isArray(side.ROI)||side.ROI.length!==4||!side.ROI.every(Number.isSafeInteger)||side.ROI[0]<0||side.ROI[1]<0||side.ROI[2]<=1||side.ROI[3]<=1||side.ROI[0]+side.ROI[2]>=face.sourceWH[0]||side.ROI[1]+side.ROI[3]>=face.sourceWH[1])throw Error('亮眼裁切缓存无效');
   for(const [key,count]of [['worldBits',280],['pupilBits',98]])if(!Array.isArray(side[key])||side[key].length!==count||!side[key].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)||!brightEyeFloatValues(side[key]).every(Number.isFinite))throw Error('亮眼网格缓存无效');
   if(typeof side.highlightBase64!=='string'||side.highlightBase64.length!==53336||!/^[A-Za-z0-9+/]+==$/.test(side.highlightBase64)||atob(side.highlightBase64).length!==40000)throw Error('亮眼高光缓存无效');
   return {side:side.side,ROI:[...side.ROI],closed:side.closed,worldBits:[...side.worldBits],pupilBits:[...side.pupilBits],highlightBase64:side.highlightBase64};
  });
  return {format:face.format,version:face.version,sourceWH:[...face.sourceWH],sides,...(extra?{extra}:{})};
 });
 return checked;
}
