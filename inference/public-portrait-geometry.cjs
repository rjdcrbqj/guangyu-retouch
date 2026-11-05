'use strict';
function dimensions(width,height,max=80000000){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>max)throw new RangeError('人像分区尺寸无效');}
// 为当前人脸保留上下文；大图只将裁剪区域缩到推理尺寸。
function portraitCrop(box,width,height,kind){
 dimensions(width,height);
 if(!['hair','skin'].includes(kind))throw new Error('人像分区类别无效');
 if(!box||!['x','y','width','height'].every(k=>Number.isFinite(box[k]))||box.x<0||box.y<0||box.width<=0||box.height<=0||box.x+box.width>1+4*Number.EPSILON||box.y+box.height>1+4*Number.EPSILON)throw new Error('人脸框无效');
 const side=Math.max(box.width*width,box.height*height)*(kind==='hair'?3.5:2);
 const cx=(box.x+box.width/2)*width,cy=(box.y+box.height/2)*height+(kind==='hair'?box.height*height*.35:0);
 const left=Math.max(0,Math.floor(cx-side/2)),top=Math.max(0,Math.floor(cy-side/2));
 const right=Math.min(width,Math.ceil(cx+side/2)),bottom=Math.min(height,Math.ceil(cy+side/2));
 if(right<=left||bottom<=top)throw new Error('人脸框无效');
 return {left,top,width:right-left,height:bottom-top};
}

module.exports={dimensions,portraitCrop};
