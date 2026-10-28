'use strict';
const f=Math.fround,inv255=f(1/255),M=require('./mask.cjs'),{bilinear,coordinates}=M;
function applyResidualROI(sourceROI,mask,coef,bias,affine,roi,strength,channels=3){const[x,y,w,h]=roi,n=384*384,out=Uint8Array.from(sourceROI);for(let row=0;row<h;row++)for(let col=0;col<w;col++){const i=row*w+col,alpha=Math.min(f(f(mask[i]*inv255)*f(strength)),1);if(!(alpha>0))continue;const{idx,wx,wy}=coordinates(affine,x+col,y+row),at=i*channels,c=[0,1,2].map(j=>f(out[at+j]*inv255));for(let j=0;j<3;j++){const off=j*3,k0=bilinear(coef,(off+0)*n,idx,wx,wy),k1=bilinear(coef,(off+1)*n,idx,wx,wy),k2=bilinear(coef,(off+2)*n,idx,wx,wy),b=bilinear(bias,j*n,idx,wx,wy),sum=f(f(f(k0*c[0])+f(k1*c[1]))+f(k2*c[2])),delta=f(f(sum*alpha)+f(b*alpha));out[at+j]=Math.max(0,Math.min(255,Math.trunc(delta*255+sourceROI[at+j])));}}return out;}

// 检查供给合同，防止错误维度写入照片。
function affine(a){return a instanceof Float32Array&&a.length===6&&a.every(Number.isFinite);}
function runFace({source,width,height,geometry,heads,parsingPlanes,savedParsingInverse,strength}){
 if(!(source instanceof Uint8Array)||!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width>32766||height>32766||width*height>80000000||source.length!==width*height*3)throw Error('肤色统一照片像素或尺寸无效');
 if(typeof strength!=='number'||!Number.isFinite(strength)||strength<0||strength>1)throw Error('肤色统一强度无效');
 const ROI=geometry?.ROI;
 if(!(ROI instanceof Int32Array)||ROI.length!==4)throw Error('肤色统一区域无效');
 const [x,y,w,h]=ROI,output=Uint8Array.from(source);
 if(w<=0||h<=0||strength===0)return {processed:false,output,ROI:Array.from(ROI),changedRGBFields:0};
 if(x<0||y<0||x+w>width||y+h>height||w>4096||h>4096||!affine(geometry.residualForward)||!affine(savedParsingInverse))throw Error('肤色统一区域或矩阵无效');
 const area=384*384;
 for(const [name,count] of [['head1',1],['head3',3],['head9',9]])if(!(heads?.[name] instanceof Float32Array)||heads[name].length!==area*count||!heads[name].every(Number.isFinite))throw Error('肤色统一模型输出无效');
 const masks=M.v2Masks(parsingPlanes),projected=M.project(masks.threshold,384,384,savedParsingInverse,ROI),mask=M.modulate(projected,M.normalizeHead(heads.head1),geometry.residualForward,ROI);
 if(!mask.some(v=>v>1))return {processed:false,output,ROI:Array.from(ROI),changedRGBFields:0};
 const sourceROI=new Uint8Array(w*h*3);
 for(let row=0;row<h;row++)sourceROI.set(source.subarray(((y+row)*width+x)*3,((y+row)*width+x+w)*3),row*w*3);
 const result=applyResidualROI(sourceROI,mask,heads.head9,heads.head3,geometry.residualForward,ROI,f(strength));
 let changedRGBFields=0;for(let i=0;i<result.length;i++)if(result[i]!==sourceROI[i])changedRGBFields++;
 for(let row=0;row<h;row++)output.set(result.subarray(row*w*3,(row+1)*w*3),((y+row)*width+x)*3);
 return {processed:true,output,ROI:Array.from(ROI),changedRGBFields};
}
module.exports={runFace,applyResidualROI};
