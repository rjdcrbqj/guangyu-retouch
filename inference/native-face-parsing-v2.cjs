'use strict';
// 原V2有限几何、RGB采样及单平面投影；检测、JS trig与图像库仍为明确外部边界。
const {warpBytes,resizeBytes}=require('./opencv-runtime.cjs');
const f=Math.fround,SIDE=384,AREA=SIDE*SIDE;
const MEAN=[123.67500305175781,116.27999877929688,103.52999877929688];
const SCALE=[.017124753445386887,.017507003620266914,.01742919348180294];

// 原first142边界和角度扩展，每个运算独立F32舍入。
function geometry142(points,angle){
 const p=points.map(q=>q.map(f)),sin=f(Math.sin(angle)),cos=f(Math.cos(angle));
 let [x,y]=p[0],[mx,my]=p[0];
 for(const [a,b] of p.slice(1)){if(a<x)x=a;if(b<y)y=b;if(a>mx)mx=a;if(b>my)my=b;}
 const w=f(mx-x),h=f(my-y),span=f(f(f(w+h)/f(2))*f(.4));
 const dx=f(sin*span),dy=f(f(-span)*cos),W=f(w+Math.abs(dx)),H=f(h+Math.abs(dy));
 const bounds=[f(f(W*f(-.5))+f(f(dx*f(.5))+f(x+f(w*f(.5))))),f(f(H*f(-.5))+f(f(dy*f(.5))+f(y+f(h*f(.5))))),W,H];
 if(bounds.some(v=>!Number.isFinite(v))||W<=0||H<=0)throw new RangeError('原V2关键点范围退化');
 const s=f(Math.sin(f(-angle))),c=f(Math.cos(f(-angle))),scale=f(f(f(1-f(.4))*f(SIDE))/Math.max(W,H));
 const cx=f(bounds[0]+f(W*f(.5))),cy=f(bounds[1]+f(H*f(.5))),center=f(Math.trunc(SIDE/2));
 const A=f(scale*c),B=f(f(-s)*scale),C=f(scale*s),D=f(scale*c),tx=f(center+f(f(B*f(-cy))+f(A*f(-cx)))),ty=f(center+f(f(f(-cx)*C)+f(f(-cy)*D)));
 const r=f(1/f(f(A*D)+f(f(-B)*C))),ia=f(D*r),ic=f(f(-C)*r),ib=f(f(-B)*r),id=f(A*r);
 const savedInverse=[ia,ib,f(f(f(-ib)*ty)-f(tx*ia)),ic,id,f(f(f(-id)*ty)-f(tx*ic))];
 if(![A,B,C,D,tx,ty,...savedInverse].every(Number.isFinite))throw new RangeError('原V2仿射矩阵退化');
 return {bounds,scale,columnMajor:[A,C,0,B,D,0,tx,ty,1],affine:[A,B,tx,C,D,ty],savedInverse};
}

// 原1446d03a0：整数目标坐标、DOUBLE连续步进、完整2x2支撑、RGB平面。
function prepareNativeV2Input({rgb,width,height,points142,angle}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>80000000||!(rgb instanceof Uint8Array)||rgb.length!==width*height*3)throw new RangeError('原V2需要有效RGB照片像素与尺寸');
 if(!Array.isArray(points142)||points142.length!==142||points142.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||!Number.isFinite(f(v)))))throw new RangeError('原V2需要142个有限关键点坐标');
 if(!Number.isFinite(angle)||!Number.isFinite(f(angle)))throw new RangeError('原V2需要有限人脸角度');
 const geometry=geometry142(points142,f(angle)),inv=geometry.savedInverse,input=new Float32Array(3*AREA);
 for(let y=0;y<SIDE;y++){
  let sx=y*inv[1]+inv[2],sy=y*inv[4]+inv[5];
  for(let x=0;x<SIDE;x++){
   const ix=Math.floor(sx),iy=Math.floor(sy),valid=ix>=0&&iy>=0&&ix<width-1&&iy<height-1,pixel=y*SIDE+x;
   let weights,tl;
   if(valid){const dx=f(sx-ix),dy=f(sy-iy),nx=f(1-dx),ny=f(1-dy);weights=[f(nx*ny),f(dx*ny),f(nx*dy),f(dx*dy)];tl=(iy*width+ix)*3;}
   for(let c=0;c<3;c++){
    let value=0;
    if(valid){value=f(f(rgb[tl+c]*weights[0])+f(rgb[tl+3+c]*weights[1]));value=f(value+f(rgb[tl+width*3+c]*weights[2]));value=f(value+f(rgb[tl+width*3+3+c]*weights[3]));}
    input[c*AREA+pixel]=f(f(value-MEAN[c])*SCALE[c]); // 原归一化为两个F32操作。
   }
   sx+=inv[0];sy+=inv[3];
  }
 }
 return {geometry,input};
}

// 原helper单plane非ROI路径：保存的INT原图大小warp，然后BYTE线性缩到预览。
function projectNativeV2Mask({plane,inverse,sourceWidth,sourceHeight,width,height}={}){
 if(!(plane instanceof Uint8Array)||plane.length!==AREA||![sourceWidth,sourceHeight,width,height].every(Number.isInteger)||sourceWidth<2||sourceHeight<2||sourceWidth*sourceHeight>80000000||width<1||height<1||width>1600||height>1600)throw new RangeError('原V2分区像素或投影尺寸无效');
 if(!((Array.isArray(inverse))||(inverse instanceof Float32Array))||inverse.length!==6||inverse.some(v=>!Number.isFinite(v)||!Number.isFinite(f(v))))throw new RangeError('原V2投影矩阵必须为六个有限数值');
 const full=warpBytes({data:plane,width:SIDE,height:SIDE,channels:1,affine:Float32Array.from(inverse),targetWidth:sourceWidth,targetHeight:sourceHeight,borderValue:0});
 return resizeBytes({data:full,width:sourceWidth,height:sourceHeight,channels:1,targetWidth:width,targetHeight:height});
}
module.exports={prepareNativeV2Input,projectNativeV2Mask};
