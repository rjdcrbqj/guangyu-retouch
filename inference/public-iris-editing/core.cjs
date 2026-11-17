'use strict';
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
const decode=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const linear=Float64Array.from({length:256},(_,i)=>decode(i/255));
const encode=v=>Math.round(Math.max(0,Math.min(1,v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055))*255);
// 严格验证可持久化的四参数，不允许未知字段静默改变行为。
function irisSettings(options){
 const limits={leftPercent:100,rightPercent:100,hueDegrees:360,saturationPercent:100};
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!Object.hasOwn(limits,k))||Object.entries(limits).some(([k,max])=>typeof options[k]!=='number'||!Number.isFinite(options[k])||options[k]<0||options[k]>max))throw Error('虹膜调色参数无效');
 return Object.fromEntries(Object.keys(limits).map(k=>[k,options[k]]));
}
function validateFrame(frame){
 const {data,width,height,regions}=frame||{};
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=32768)||width*height>80000000||!(data instanceof Uint8Array)||data.length!==width*height*4||!Array.isArray(regions)||regions.length>32)throw Error('虹膜照片或区域无效');
 for(const region of regions){
  const {roi,maskWidth:mw,maskHeight:mh,rgba,iris,faceIndex,side}=region||{};
  if(!Array.isArray(roi)||roi.length!==4||!roi.every(Number.isSafeInteger)||roi[0]<0||roi[1]<0||roi[2]<=0||roi[3]<=0||roi[0]+roi[2]>width||roi[1]+roi[3]>height||![mw,mh].every(v=>Number.isSafeInteger(v)&&v>0&&v<=256)||!(rgba instanceof Uint8Array)||rgba.length!==mw*mh*4||!Number.isSafeInteger(faceIndex)||faceIndex<0||faceIndex>=8||![0,1].includes(side))throw Error('虹膜区域或蒙版损坏');
  if(!iris||![iris.center,iris.u,iris.v].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('虹膜定位无效');
  const [cx,cy]=iris.center,[ux,uy]=iris.u,[vx,vy]=iris.v;
  if(cx<roi[0]||cy<roi[1]||cx>=roi[0]+roi[2]||cy>=roi[1]+roi[3]||Math.abs(ux*vy-uy*vx)<1||Math.max(Math.hypot(ux,uy),Math.hypot(vx,vy))>Math.max(roi[2],roi[3]))throw Error('虹膜定位无效');
 }
}
function coverage(region,x,y){
 const {roi,maskWidth:mw,maskHeight:mh,rgba}=region,qx=Math.max(0,Math.min(mw-1,(x-roi[0])*mw/roi[2]-.5)),qy=Math.max(0,Math.min(mh-1,(y-roi[1])*mh/roi[3]-.5)),ix=Math.floor(qx),iy=Math.floor(qy),jx=Math.min(ix+1,mw-1),jy=Math.min(iy+1,mh-1),dx=qx-ix,dy=qy-iy;
 return ((1-dx)*(1-dy)*rgba[(iy*mw+ix)*4+1]+dx*(1-dy)*rgba[(iy*mw+jx)*4+1]+(1-dx)*dy*rgba[(jy*mw+ix)*4+1]+dx*dy*rgba[(jy*mw+jx)*4+1])/255;
}
// 目标色相转为单位亮度线性RGB；每个像素仍保留自己原有的亮度和纹理。
function targetDirection(hueDegrees,saturationPercent){
 const h=(hueDegrees%360)/60,s=saturationPercent/100,x=1-Math.abs(h%2-1),sectors=[[1,x,0],[x,1,0],[0,1,x],[0,x,1],[x,0,1],[1,0,x]],rgb=sectors[Math.floor(h)].map(v=>decode(1-s+v*s)),y=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 return rgb.map(v=>v/y);
}
// 高光按该眼的局部亮度判断，避免暗虹膜里的灰色反射因未到纯白而被染色。
function highlightThreshold(data,width,region){
 const [left,top,rw,rh]=region.roi,[cx,cy]=region.iris.center,[ux,uy]=region.iris.u,[vx,vy]=region.iris.v,det=ux*vy-uy*vx,step=Math.max(1,Math.ceil(Math.max(rw,rh)/64)),samples=[];
 for(let y=top;y<top+rh;y+=step)for(let x=left;x<left+rw;x+=step){
  const dx=x+.5-cx,dy=y+.5-cy,r=Math.hypot((dx*vy-dy*vx)/det,(ux*dy-uy*dx)/det),i=(y*width+x)*4;
  if(r>.48&&r<.95&&data[i+3]&&coverage(region,x+.5,y+.5)>.5)samples.push(linear[data[i]]*.2126+linear[data[i+1]]*.7152+linear[data[i+2]]*.0722);
 }
 samples.sort((a,b)=>a-b);const median=samples.length?samples[Math.floor(samples.length/2)]:0;
 return {start:Math.max(.06,median*2.2),width:Math.max(.02,median*.75)};
}
function editIris(frame,options){
 validateFrame(frame);const settings=irisSettings(options),{data,width,regions}=frame,output=new Uint8Array(data),eyes=new Set(),faces=new Set(),target=targetDirection(settings.hueDegrees,settings.saturationPercent);
 for(const region of regions){
  const strength=(region.side?settings.rightPercent:settings.leftPercent)/100;if(!strength)continue;
  const [left,top,rw,rh]=region.roi,[cx,cy]=region.iris.center,[ux,uy]=region.iris.u,[vx,vy]=region.iris.v,det=ux*vy-uy*vx,highlight=highlightThreshold(data,width,region);let changed=false;
  for(let y=top;y<top+rh;y++)for(let x=left;x<left+rw;x++){
   const i=(y*width+x)*4;if(!data[i+3])continue;
   const dx=x+.5-cx,dy=y+.5-cy,r=Math.hypot((dx*vy-dy*vx)/det,(ux*dy-uy*dx)/det);if(r<=.48||r>=1)continue;
   const rgb=[linear[data[i]],linear[data[i+1]],linear[data[i+2]]],luma=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
   const amount=strength*coverage(region,x+.5,y+.5)*smooth((r-.48)/.12)*smooth((1-r)/.15)*smooth((luma-.005)/.018)*(1-smooth((luma-.5)/.3))*(1-smooth((luma-highlight.start)/highlight.width));if(!amount)continue;
   const desired=target.map(v=>v*luma),maximum=Math.max(...desired),gamut=maximum>1?(1-luma)/(maximum-luma):1;
   const corrected=rgb.map((v,k)=>encode(v+(luma+(desired[k]-luma)*gamut-v)*amount));
   const delta=corrected.reduce((sum,v,k)=>sum+Math.abs(v-data[i+k]),0),oldDelta=rgb.reduce((sum,_,k)=>sum+Math.abs(output[i+k]-data[i+k]),0);
   if(delta){changed=true;if(delta>oldDelta)for(let k=0;k<3;k++)output[i+k]=corrected[k];} // 重叠取最大单次修饰，不从已处理图重复采样。
  }
  if(changed){eyes.add(region.faceIndex+':'+region.side);faces.add(region.faceIndex);}
 }
 let changedRGBFields=0;for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)if(output[i+c]!==data[i+c])changedRGBFields++;
 return {output,changedRGBFields,processedEyes:eyes.size,processedFaceIndices:[...faces].sort((a,b)=>a-b)};
}
module.exports={editIris,irisSettings};
