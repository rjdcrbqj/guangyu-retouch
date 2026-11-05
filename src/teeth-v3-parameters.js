
// Literal candidate for original numeric fragments only; caller supplies original POD/layout values.
const F = Math.fround;
function positiveIntDims(v){return v.length===2&&v.every(x=>Number.isInteger(x)&&x>0&&x<=0x7fffffff);}
function adaptSavedInverse({savedInverse,savedSourceWH,targetWH}) {
  if(savedInverse.length!==6||!savedInverse.every(Number.isFinite)||!positiveIntDims(savedSourceWH)||!positiveIntDims(targetWH)) throw new RangeError('explicit finite inverse and positive INT32 dimensions required');
  const sx=F(F(targetWH[0])/F(savedSourceWH[0])),sy=F(F(targetWH[1])/F(savedSourceWH[1]));
  return Array.from(savedInverse,(x,j)=>F(F(x)*(j<3?sx:sy)));
}
function mvpForDimensions({width=800,height=800}={}) {
  if(!positiveIntDims([width,height]))throw new RangeError('positive INT32 dimensions required');
  return [F(2/F(width)),0,0,0,0,F(2/F(height)),0,0,0,0,-1,0,-1,-1,-0,1];
}
function inverse3Float32(m) {
  const [a,b,c,d,e,f,g,h,i] = m.map(F);
  const c00=e*i-f*h, c20=d*h-e*g;
  const determinant=c*c20+(a*c00-(d*i-f*g)*b);
  if(determinant===0) throw new RangeError('singular matrix requires original Mat dispatcher zero-fill branch');
  const r=1/determinant;
  return [c00*r,(h*c-i*b)*r,(b*f-c*e)*r,(f*g+(-i)*d)*r,(a*i+(-g)*c)*r,(c*d-a*f)*r,c20*r,(g*b+(-h)*a)*r,(a*e-b*d)*r].map(F);
}
function projectFromPod({podSix,sourceWH,maskWH}) {
  if(!Array.isArray(podSix)||podSix.length!==6 || !podSix.every(v=>typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(F(v))) || !positiveIntDims(sourceWH)||!positiveIntDims(maskWH)) throw new RangeError('explicit finite six coefficients and positive INT32 dimensions required');
  const sx=F(1/F(sourceWH[0])),sy=F(1/F(sourceWH[1]));
  const originalPre=[...podSix.map((v,j)=>F(F(v)*(j<3?sx:sy))),0,0,1];
  const originalInverse=inverse3Float32(originalPre);
  const originalNormalized=[...originalInverse.slice(0,6).map((v,j)=>F(v/F(maskWH[j<3?0:1]))),0,0,1];
  const originalGLColumnMajor=[0,3,6,1,4,7,2,5,8].map(j=>originalNormalized[j]);
  if([...originalPre,...originalInverse,...originalNormalized].some(v=>!Number.isFinite(v)))throw Error('牙齿投影矩阵退化');
  return {originalPre,originalInverse,originalNormalized,originalGLColumnMajor};
}
export {inverse3Float32,projectFromPod,mvpForDimensions};

// This APP percentage mapping is explicit; original stored-float UI normalization is not recovered.
export function teethV3Weights(p){const master=F(p.nativeTeethMaster/100),whiten=F(F(p.nativeTeethWhiten/100)*master),bright=F(master*F(p.nativeTeethBright/100));return {master,whiten,bright,degree:1,active:Boolean(p.nativeTeethEnabled)&&master>=.001&&(whiten>=.001||bright>=.001)&&(whiten>F(.001)||bright>F(.001))};}
export function decodeNativeTeethRGBA(face){return Uint8Array.from(atob(face.rgbaBase64),c=>c.charCodeAt(0));}
export function nativeTeethPodSix(face){return Array.from(new Float32Array(Uint32Array.from(face.podSixBits).buffer));}
export function validateNativeTeethFaces(input,{sourceWH}={}){
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>12)throw Error('牙齿投影数据损坏');
 return input.map(face=>{
  const dimensions=v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>0)&&v[0]*v[1]<=80000000;
  if(!face||face.format!=='guangyu-native-teeth-v3-face'||face.version!==1||!dimensions(face.sourceWH)||!Array.isArray(face.maskWH)||face.maskWH.length!==2||face.maskWH.some(v=>v!==384)||!Array.isArray(face.podSixBits)||face.podSixBits.length!==6||face.podSixBits.some(v=>!Number.isInteger(v)||v<0||v>4294967295)||typeof face.rgbaBase64!=='string'||face.rgbaBase64.length!==786432||!/^[A-Za-z0-9+/]+$/.test(face.rgbaBase64))throw Error('牙齿投影数据损坏');
  if(sourceWH&&face.sourceWH.some((v,i)=>v!==sourceWH[i]))throw Error('牙齿投影与原照片尺寸不匹配');
  const podSix=nativeTeethPodSix(face);if(podSix.some(v=>!Number.isFinite(v)))throw Error('牙齿投影数据损坏');
  projectFromPod({podSix,sourceWH:face.sourceWH,maskWH:face.maskWH});
  const bytes=decodeNativeTeethRGBA(face);if(bytes.length!==384*384*4)throw Error('牙齿平面尺寸损坏');
  for(let i=0;i<bytes.length;i+=4)if(bytes[i+2]!==0||bytes[i+3]!==255)throw Error('牙齿平面格式损坏');
  return {format:face.format,version:1,sourceWH:[...face.sourceWH],maskWH:[...face.maskWH],podSixBits:[...face.podSixBits],rgbaBase64:face.rgbaBase64};
 });
}
