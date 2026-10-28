const f=Math.fround;
function mouth22Box(points,width,height){
if(!(points instanceof Float32Array)||points.length!==388||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8000||height>8000||points.some(x=>!Number.isFinite(x)||Math.abs(x)>16000))throw Error('Explicit tested finite supplied-point domain');
const min=[Math.min(points[146],f(width)),Math.min(points[147],f(height))],max=[Math.max(points[146],0),Math.max(points[147],0)];
for(let i=74;i<=94;i++)for(let c=0;c<2;c++){min[c]=Math.min(points[i*2+c],min[c]);max[c]=Math.max(points[i*2+c],max[c]);}
const xy=[],wh=[];for(let c=0;c<2;c++){const d=f(f(max[c]-min[c])*f(.1));const left=Math.max(Math.trunc(f(min[c]-d)),0),right=Math.min(Math.trunc(f(max[c]+d)),c===0?width:height);xy.push(f(left));wh.push(f(f(right)-f(left)));}
return new Float32Array([...xy,...wh]);
}
module.exports={mouth22Box};
