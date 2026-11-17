'use strict';
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

// 配方只接受明确强度，损坏工程不能静默转成默认处理。
function redEyeSettings(options){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='strengthPercent')||typeof options.strengthPercent!=='number'||!Number.isFinite(options.strengthPercent)||options.strengthPercent<0||options.strengthPercent>100)throw Error('红眼强度无效');
 return {strengthPercent:options.strengthPercent};
}
function validateFrame(frame){
 const {data,width,height,regions}=frame||{};
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=32768)||width*height>80000000||!(data instanceof Uint8Array)||data.length!==width*height*4||!Array.isArray(regions)||regions.length>32)throw Error('红眼照片或区域无效');
 for(const region of regions){
  const {roi,maskWidth:mw,maskHeight:mh,rgba,iris,faceIndex,side}=region||{};
  if(!Array.isArray(roi)||roi.length!==4||!roi.every(Number.isSafeInteger)||roi[0]<0||roi[1]<0||roi[2]<=0||roi[3]<=0||roi[0]+roi[2]>width||roi[1]+roi[3]>height||![mw,mh].every(v=>Number.isSafeInteger(v)&&v>0&&v<=256)||!(rgba instanceof Uint8Array)||rgba.length!==mw*mh*4||!Number.isSafeInteger(faceIndex)||faceIndex<0||faceIndex>=8||![0,1].includes(side))throw Error('红眼区域或蒙版损坏');
  if(!iris||![iris.center,iris.u,iris.v].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('虹膜定位无效');
  const [cx,cy]=iris.center,[ux,uy]=iris.u,[vx,vy]=iris.v;
  if(cx<roi[0]||cy<roi[1]||cx>=roi[0]+roi[2]||cy>=roi[1]+roi[3]||Math.abs(ux*vy-uy*vx)<1||Math.max(Math.hypot(ux,uy),Math.hypot(vx,vy))>Math.max(roi[2],roi[3]))throw Error('虹膜定位无效');
 }
}
// 在原尺寸坐标取连续虹膜置信度；不把低分辨率蒙版当作原图像素。
function irisCoverage(region,x,y){
 const {roi,maskWidth:mw,maskHeight:mh,rgba}=region;
 const qx=Math.max(0,Math.min(mw-1,(x-roi[0])*mw/roi[2]-.5)),qy=Math.max(0,Math.min(mh-1,(y-roi[1])*mh/roi[3]-.5));
 const ix=Math.floor(qx),iy=Math.floor(qy),jx=Math.min(ix+1,mw-1),jy=Math.min(iy+1,mh-1),dx=qx-ix,dy=qy-iy;
 return ((1-dx)*(1-dy)*rgba[(iy*mw+ix)*4+1]+dx*(1-dy)*rgba[(iy*mw+jx)*4+1]+(1-dx)*dy*rgba[(jy*mw+ix)*4+1]+dx*dy*rgba[(jy*mw+jx)*4+1])/255;
}
// 只压低带中心红瞳证据的连通区域，所有眼区都从同一原图取样。
function correctRedEye(frame,options){
 validateFrame(frame);const {strengthPercent}=redEyeSettings(options),{data,width,regions}=frame,output=new Uint8Array(data),eyes=new Set(),faces=new Set();
 if(strengthPercent)for(const region of regions){
  const [left,top,rw,rh]=region.roi,[cx,cy]=region.iris.center,[ux,uy]=region.iris.u,[vx,vy]=region.iris.v,det=ux*vy-uy*vx;
  const candidates=new Uint8Array(rw*rh),seeds=new Uint8Array(rw*rh),seen=new Uint8Array(rw*rh),queue=new Int32Array(rw*rh),seedColors=[];let irisArea=0;
  const radius=(x,y)=>Math.hypot(((x-cx)*vy-(y-cy)*vx)/det,(ux*(y-cy)-uy*(x-cx))/det);
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
   const px=left+x+.5,py=top+y+.5,k=y*rw+x,i=((top+y)*width+left+x)*4,r=radius(px,py),coverage=irisCoverage(region,px,py);
   if(coverage<.2||r>1.05||!data[i+3])continue;irisArea++;
   const red=data[i],other=Math.max(data[i+1],data[i+2]),excess=red-other;
   if(red>20&&excess>8&&red>other*1.2){candidates[k]=1;if(r<.28&&red>70&&excess>45&&red>other*1.8){seeds[k]=1;seedColors.push((data[i+1]-data[i+2])/(red-Math.min(data[i+1],data[i+2])));}}
  }
  if(seedColors.length<2)continue;
  seedColors.sort((a,b)=>a-b);const seedHue=seedColors[Math.floor(seedColors.length/2)];
  const hueDistance=i=>Math.max(0,(data[i+1]-data[i+2])/(data[i]-Math.min(data[i+1],data[i+2]))-seedHue);
  // 排除向棕黄方向偏离的虹膜；红优势仍成立时允许蓝色反光混入红瞳。
  for(let k=0;k<candidates.length;k++)if(candidates[k]){const i=((top+Math.floor(k/rw))*width+left+k%rw)*4;if(hueDistance(i)>=.2)candidates[k]=0;}
  let eyeChanged=false;
  for(let start=0;start<candidates.length;start++){
   if(!candidates[start]||seen[start])continue;let head=0,tail=1,centralSeeds=0;queue[0]=start;seen[start]=1;
   while(head<tail){
    const k=queue[head++],x=k%rw,y=Math.floor(k/rw);centralSeeds+=seeds[k];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     const xx=x+dx,yy=y+dy;if(xx<0||xx>=rw||yy<0||yy>=rh)continue;const next=yy*rw+xx;
     if(candidates[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
    }
   }
   if(tail<3||centralSeeds<Math.max(2,irisArea*.006)||tail>irisArea*.9)continue; // 小彩噪和整圈红棕虹膜不构成可靠红瞳。
   for(let j=0;j<tail;j++){
    const k=queue[j],x=left+k%rw,y=top+Math.floor(k/rw),i=(y*width+x)*4,red=data[i],other=Math.max(data[i+1],data[i+2]);
    const amount=strengthPercent/100*irisCoverage(region,x+.5,y+.5)*smooth((1.05-radius(x+.5,y+.5))/.18)*smooth((red-other-8)/20)*smooth((.2-hueDistance(i))/.1);
    const corrected=Math.round(red+((data[i+1]+data[i+2])*.5-red)*amount);
    if(corrected<red){output[i]=Math.min(output[i],corrected);eyeChanged=true;} // 重叠定位取最大单次修饰，绝不反复叠加。
   }
  }
  if(eyeChanged){eyes.add(region.faceIndex+':'+region.side);faces.add(region.faceIndex);}
 }
 let changedRGBFields=0;for(let i=0;i<data.length;i+=4)if(output[i]!==data[i])changedRGBFields++;
 return {output,changedRGBFields,processedEyes:eyes.size,processedFaceIndices:[...faces].sort((a,b)=>a-b)};
}
module.exports={correctRedEye,redEyeSettings};
