'use strict';
// Native 145bc11e0 main region masks. Float32 arithmetic; no Python/native dependencies.
const f=Math.fround;
function remapStrength(s){
 if(!Number.isFinite(s)||s<0||s>1)throw new RangeError('Strength must be within0..1');
 s=f(s);
 if(s<=.001)return 0;
 let q=f(s*s);
 if(q>.4&&q<.8){const t=f(f(q+f(-.4))/f(.4));q=f(f(f(f(3-f(t+t))*t)*t)*f(.4)+f(.4));}
 return q;
}
function reflect(i,n){while(i<0||i>=n)i=i<0?-i:2*n-2-i;return i;}
function boxBlur(a,width,height,k=21){
 const r=(k-1)/2,out=new Float32Array(a.length),tmp=new Float32Array(a.length);
 for(let y=0;y<height;y++){let sum=0;for(let j=-r;j<=r;j++)sum+=a[y*width+reflect(j,width)];for(let x=0;x<width;x++){tmp[y*width+x]=sum;sum+=a[y*width+reflect(x+r+1,width)]-a[y*width+reflect(x-r,width)];}}
 for(let x=0;x<width;x++){let sum=0;for(let j=-r;j<=r;j++)sum+=tmp[reflect(j,height)*width+x];for(let y=0;y<height;y++){out[y*width+x]=sum/(k*k);sum+=tmp[reflect(y+r+1,height)*width+x]-tmp[reflect(y-r,height)*width+x];}}
 return out;
}
function region7({side,points,head1,mainMask,strength,nativeContextInt,nativeProtectionFlag}){
 if(side!==768&&side!==1024)throw new RangeError('Original main side must be768or1024');
 if(!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('Invalid strength');
 for(const [name,a]of Object.entries({head1,mainMask}))if(!(a instanceof Float32Array)||a.length!==side*side||a.some(v=>!Number.isFinite(v)))throw new RangeError('Invalid '+name);
 const p={};for(const i of [2,11,55,193]){const xy=points?.[i];if(!xy||xy.length!==2||!xy.every(Number.isFinite))throw new RangeError(`Verified native194 point${i} is required`);p[i]=Array.from(xy,v=>f(v));}
 if(nativeProtectionFlag&&!Number.isInteger(nativeContextInt))throw new RangeError('Protection branch requires original context integer');
 const scale=side===1024?1.5:1;
 const lo=[Math.max(0,Math.trunc(f(p[2][0]/scale))),Math.max(0,Math.trunc(f(p[193][1]/scale)))];
 const hi=[Math.min(side-1,Math.trunc(f(p[11][0]/scale))),Math.min(side-1,Math.trunc(f(p[55][1]/scale)))];
 const x0=Math.min(lo[0],hi[0]),y0=Math.min(lo[1],hi[1]),x1=Math.max(lo[0],hi[0]),y1=Math.max(lo[1],hi[1]);
 if(x0<0||y0<0||x1>side||y1>side||x0===x1||y0===y1)throw new RangeError('Native region rectangle is invalid');
 const shape=new Float32Array(side*side);for(let y=y0;y<y1;y++)shape.fill(1,y*side+x0,y*side+x1);
 const feather=boxBlur(shape,side,side,21),out=new Float32Array(shape.length);
 const roi={x0:Math.max(10,x0)-10,y0:Math.max(10,y0)-10,x1:Math.min(side-1,x1+10),y1:Math.min(side-1,y1+10)};
 for(let y=roi.y0;y<roi.y1;y++)for(let x=roi.x0;x<roi.x1;x++){
  const i=y*side+x;let m=f(f(feather[i]*head1[i])*mainMask[i]);
  // Original145be0cf0 callback. Forwarded flag/int semantic names remain unresolved.
  if(nativeProtectionFlag&&nativeContextInt>=11&&nativeContextInt<=49&&m<.5)m=Math.min(.5,f(f(f(m*f(1/3))+f(f(f(m*f(-.37037035822868347))*m)*m))+f(f(m*f(.5555555820465088))*m)));
  out[i]=f(m*f(strength));
 }
 return {mask:out,roi,pointIndices:[2,11,55,193],native:'145bd6ce0->145bc80e0;optional145be0cf0'};
}
function region6({side,points,head0,head3,head6,mainMask,strength}){
 if(side!==768&&side!==1024)throw new RangeError('Original main side must be768or1024');
 if(!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('Invalid strength');
 for(const [name,a]of Object.entries({head0,head3,head6,mainMask}))if(!(a instanceof Float32Array)||a.length!==side*side||a.some(v=>!Number.isFinite(v)))throw new RangeError('Invalid '+name);
 const p={};for(const i of [58,119,131]){const xy=points?.[i];if(!xy||xy.length!==2||!xy.every(Number.isFinite))throw new RangeError(`Verified native194 point${i} is required`);p[i]=Array.from(xy,v=>f(v));}
 const scale=side===1024?1.5:1;
 const left=Math.max(0,Math.trunc(f(p[119][0]/scale))),right=Math.min(side-1,Math.trunc(f(p[131][0]/scale))),top=Math.max(0,Math.trunc(f(p[58][1]/scale)));
 const x0=Math.min(left,right),x1=Math.max(left,right),y0=Math.min(top,side-1);
 if(x0<0||x1>side||x0===x1||y0<0)throw new RangeError('Native lower region rectangle is invalid');
 const outerLeft=Math.max(10,Math.trunc(f(p[119][0]/scale)))-10,outerRight=Math.min(side-1,Math.trunc(f(p[131][0]/scale))+10);
 const roi={x0:Math.min(outerLeft,outerRight),x1:Math.max(outerLeft,outerRight),y0:Math.min(Math.max(10,Math.trunc(f(p[58][1]/scale)))-10,side-1),y1:side};
 const binary=new Float32Array(side*side);
 for(let y=y0;y<side;y++)for(let x=x0;x<x1;x++){const i=y*side+x;binary[i]=f(f(head3[i]-head6[i])-head0[i])>0?1:0;}
 const feather=boxBlur(binary,side,side,21),out=new Float32Array(binary.length);
 for(let y=roi.y0;y<roi.y1;y++)for(let x=roi.x0;x<roi.x1;x++){const i=y*side+x;out[i]=f(f(feather[i]*mainMask[i])*f(strength));}
 return {mask:out,roi,pointIndices:[58,119,131],native:'145bd7c80->145bc73d0'};
}

function args(side,points,ids,arrays,strength){
 if(![768,1024].includes(side))throw new RangeError('native main side');if(!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('strength');
 for(const [name,a]of Object.entries(arrays))if(!(a instanceof Float32Array)||a.length!==side*side||!a.every(Number.isFinite))throw new RangeError(name+' shape/finite');
 const scale=side===1024?1.5:1,p={};for(const id of ids){const a=points?.[id];if(!a||a.length!==2||!a.every(Number.isFinite))throw new RangeError('verified native194 point '+id+' required');p[id]=Array.from(a,v=>f(f(v)/scale));}return p;
}
function rect(side,x0,y0,x1,y1){if(![x0,y0,x1,y1].every(Number.isInteger)||x0<0||y0<0||x1>side||y1>side||x0>=x1||y0>=y1)throw new RangeError('native rect invalid');return {x0,y0,x1,y1};}
function forRect(side,r,fn){for(let y=r.y0;y<r.y1;y++)for(let x=r.x0;x<r.x1;x++)fn(y*side+x,x,y);}
// OpenCV ROI blur默认读取parent周围；仅把blur结果写回指定ROI，避免误用isolated边界。
function blurInPlace(a,side,r,k){const b=boxBlur(a,side,side,k);forRect(side,r,i=>{a[i]=b[i];});}
function region9({side,points,head0,mainMask,strength,nativeContextInt,nativeProtectionFlag}){
 const ids=[57,73,83,104,108,125],p=args(side,points,ids,{head0,mainMask},strength);if(!Number.isInteger(nativeContextInt)||typeof nativeProtectionFlag!=='boolean')throw new RangeError('native context int/flag required');
 // 145bd5d60的外层5像素扩展，与145bc7950核心矩形各有独立裁剪。
 const L=Math.max(0,Math.trunc(f(p[73][0]-100))),T=Math.max(0,Math.trunc(p[57][1]));
 const R=Math.min(side-1,Math.trunc(f(p[83][0]+100))),B=Math.min(side-1,Math.trunc(p[nativeContextInt<5?108:125][1]));
 const roi=rect(side,Math.max(5,Math.min(L,R))-5,Math.max(5,Math.min(T,B))-5,Math.min(side-1,Math.max(L,R)+5),Math.min(side-1,Math.max(T,B)+5));
 const prep=new Float32Array(side*side);forRect(side,roi,i=>{prep[i]=f(head0[i]*mainMask[i])>f(.01)?1:0;}); // 原threshold .01，而非.5。
 const helperL=Math.trunc(f(p[73][0]-100)),helperR=Math.min(side,Math.trunc(f(p[83][0]+100))),helperT=Math.trunc(p[57][1]),helperB=Math.min(side,Math.trunc(p[nativeContextInt<5?108:125][1]));
 const core=rect(side,Math.max(0,Math.min(helperL,Math.max(0,helperR))),Math.max(0,Math.min(helperT,Math.max(0,helperB))),Math.max(helperL,Math.max(0,helperR)),Math.max(helperT,Math.max(0,helperB)));
 const binary=new Float32Array(prep.length);forRect(side,core,i=>{binary[i]=prep[i];});
 if(nativeProtectionFlag){const limit=Math.max(0,Math.min(side,Math.trunc(p[104][1]))),lo=Math.min(core.y0,limit),hi=Math.max(core.y0,limit);if(hi>lo)forRect(side,rect(side,core.x0,lo,core.x1,hi),i=>{binary[i]=0;});}
 blurInPlace(binary,side,roi,11);const out=new Float32Array(binary.length),q=remapStrength(strength);forRect(side,roi,i=>{out[i]=f(f(binary[i]*mainMask[i])*q);});
 return {mask:out,roi,pointIndices:ids,native:'145bd5d60->145bc7950',threshold:.01};
}
function region2({side,points,head1,head2,mainMask,strength}){
 const ids=[2,11,54,190],p=args(side,points,ids,{head1,head2,mainMask},strength);
 const bottom=Math.min(side-1,Math.max(0,Math.trunc(p[54][1]))+10),topCut=Math.min(bottom,Math.max(0,Math.trunc(p[190][1])));
 const roi=rect(side,0,0,side,bottom),out=new Float32Array(side*side);forRect(side,roi,i=>{out[i]=head2[i];});
 if(topCut>0)forRect(side,rect(side,0,0,side,topCut),i=>{out[i]=1;});
 const blurY=Math.max(10,topCut)-10,blurH=Math.max(-10,bottom-topCut)+10;
 blurInPlace(out,side,rect(side,0,blurY,side,blurY+blurH),21);
 const xA=Math.trunc(p[2][0]),xB=Math.max(0,Math.trunc(p[11][0])),left=Math.max(0,Math.min(xA,xB)),right=Math.max(xA,xB);
 if(right>side)throw new RangeError('native side exclusion rect invalid');
 // 141bbd6d0的float HAL是subtract，mask仅选择两横向点之间；141bbb1a0再max0。
 forRect(side,roi,(i,x)=>{out[i]=Math.max(0,(x>=left&&x<right)?f(out[i]-head1[i]):out[i]);});
 const fade=new Float32Array(out.length);forRect(side,roi,i=>{fade[i]=1;});
 // 原代码只羽化bottom-22起21行，最后一行保留1，不改成常规渐变。
 blurInPlace(fade,side,rect(side,0,bottom-22,side,bottom-1),21);
 forRect(side,rect(side,0,bottom-22,side,bottom-1),i=>{out[i]=f(out[i]*fade[i]);});
 forRect(side,roi,i=>{out[i]=f(f(out[i]*mainMask[i])*f(strength));});
 return {mask:out,roi,pointIndices:ids,native:'145bd7560->145bc8c40'};
}
// 可分离float min/max矩形形态学，原常量边界（erode=+Inf,dilate=-Inf）。
function region5({side,points,head1,head4,head8,mainMask,strength}){
 const ids=[22,40,57,190],p=args(side,points,ids,{head1,head4,head8,mainMask},strength);
 const A=[Math.max(0,Math.trunc(p[22][0])),Math.max(0,Math.trunc(p[190][1]))],B=[Math.min(side-1,Math.trunc(p[40][0])),Math.min(side-1,Math.trunc(p[57][1]))];
 const core=rect(side,Math.max(0,Math.min(A[0],B[0])),Math.max(0,Math.min(A[1],B[1])),Math.max(A[0],B[0]),Math.max(A[1],B[1]));
 const P=[Math.max(15,Math.trunc(p[22][0]))-15,Math.max(15,Math.trunc(p[190][1]))-15],Q=[Math.min(side-1,Math.trunc(p[40][0])+15),Math.min(side-1,Math.trunc(p[57][1])+15)];
 const roi=rect(side,Math.min(P[0],Q[0]),Math.min(P[1],Q[1]),Math.max(P[0],Q[0]),Math.max(P[1],Q[1]));
 const eroded=morphology(head1,side,11,true),binary=new Float32Array(mainMask.length);forRect(side,roi,i=>{binary[i]=mainMask[i]>0&&f(f(head8[i]-eroded[i])-head4[i])>0?1:0;});
 const dilated=morphology(binary,side,21,false),shape=new Float32Array(binary.length),width=core.x1-core.x0,height=core.y1-core.y0,margin=Math.trunc(f(f(.07)*width));
 // 145baf860：byte阶梯边缘羽化，不是高斯或连续float渐变；右/下距用width-x,height-y。
 forRect(side,core,(i,x,y)=>{const rx=x-core.x0,ry=y-core.y0,d=Math.min(rx,width-rx,ry,height-ry),byte=d<margin?Math.trunc(d*255/margin):255;shape[i]=f(dilated[i]*f(byte*f(1/255)));});
 blurInPlace(shape,side,roi,21);const out=new Float32Array(shape.length),q=remapStrength(strength);forRect(side,roi,i=>{out[i]=f(f(shape[i]*mainMask[i])*q);});
 return {mask:out,roi,core,pointIndices:ids,native:'145bd92b0->145be11d0->145bcd320->145baf860'};
}

const DX=[-1,-1,0,1,1,1,0,-1];
const DY=[0,-1,-1,-1,0,1,1,1];

function traceBoundary(labels,width,height,id,start,pixelCount) {
  const sx=start%width,sy=Math.floor(start/width);
  let x=sx,y=sy,bx=sx-1,by=sy,firstNext=-1;
  const points=[];
  for(let steps=0;steps<=pixelCount*8+8;steps++) {
    let begin=0;
    for(let d=0;d<8;d++)if(x+DX[d]===bx&&y+DY[d]===by){begin=d;break;}
    let found=-1,nx=0,ny=0;
    for(let k=0;k<8;k++){
      const d=(begin+k)%8,tx=x+DX[d],ty=y+DY[d];
      if(tx>=0&&tx<width&&ty>=0&&ty<height&&labels[ty*width+tx]===id){found=d;nx=tx;ny=ty;break;}
    }
    if(found<0){points.push([x,y]);return points;}
    const next=ny*width+nx;
    if(firstNext<0)firstNext=next;
    else if(x===sx&&y===sy&&next===firstNext)break;
    points.push([x,y]);
    const prior=(found+7)%8;
    bx=x+DX[prior];by=y+DY[prior];x=nx;y=ny;
    if(steps===pixelCount*8+8)throw new Error('Boundary tracing failed to close');
  }
  if(points.length<=2)return points;
  // CHAIN_APPROX_SIMPLE retains only vertices where the 8-neighbor direction changes.
  return points.filter((p,i)=>{
    const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
    return p[0]-prev[0]!==next[0]-p[0]||p[1]-prev[1]!==next[1]-p[1];
  });
}

function contourArea(points){
  let twice=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];twice+=a[0]*b[1]-b[0]*a[1];
  }
  return Math.abs(twice)*0.5;
}

function exteriorBackground(binary,width,height,queue){
  const exterior=new Uint8Array(width*height);let tail=0;
  const push=p=>{if(!binary[p]&&!exterior[p]){exterior[p]=1;queue[tail++]=p;}};
  for(let x=0;x<width;x++){push(x);push((height-1)*width+x);}
  for(let y=0;y<height;y++){push(y*width);push(y*width+width-1);}
  for(let head=0;head<tail;head++){
    const p=queue[head],x=p%width,y=Math.floor(p/width);
    if(x)push(p-1);if(x+1<width)push(p+1);if(y)push(p-width);if(y+1<height)push(p+width);
  }
  return exterior;
}

function fillExternalComponent(mask,labels,width,component){
  const [left,top,w,h]=component.box,lw=w+2,lh=h+2;
  const outside=new Uint8Array(lw*lh),queue=new Int32Array(lw*lh);let tail=1;
  outside[0]=1;queue[0]=0;
  const push=p=>{
    if(outside[p])return;
    const x=p%lw,y=Math.floor(p/lw);
    if(x>0&&x<=w&&y>0&&y<=h&&labels[(top+y-1)*width+left+x-1]===component.id)return;
    outside[p]=1;queue[tail++]=p;
  };
  for(let head=0;head<tail;head++){
    const p=queue[head],x=p%lw,y=Math.floor(p/lw);
    if(x)push(p-1);if(x+1<lw)push(p+1);if(y)push(p-lw);if(y+1<lh)push(p+lw);
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(!outside[(y+1)*lw+x+1])mask[(top+y)*width+left+x]=1;
}

function topTwoContours(binary,width,height){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
      !binary||binary.length!==width*height)throw new TypeError('Binary dimensions must match positive width and height');
  const n=width*height;
  if(n>0x7fffffff)throw new RangeError('Image exceeds signed-index range');
  const queue=new Int32Array(n),labels=new Int32Array(n);
  const exterior=exteriorBackground(binary,width,height,queue),components=[];let id=0;
  for(let start=0;start<n;start++){
    if(!binary[start]||labels[start])continue;
    id++;labels[start]=id;queue[0]=start;let tail=1,external=false;
    let left=width,top=height,right=-1,bottom=-1;
    for(let head=0;head<tail;head++){
      const p=queue[head],x=p%width,y=Math.floor(p/width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      if(x===0||x===width-1||y===0||y===height-1||
          (x>0&&exterior[p-1])||(x+1<width&&exterior[p+1])||
          (y>0&&exterior[p-width])||(y+1<height&&exterior[p+width]))external=true;
      for(let d=0;d<8;d++){
        const nx=x+DX[d],ny=y+DY[d];
        if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const q=ny*width+nx;
        if(binary[q]&&!labels[q]){labels[q]=id;queue[tail++]=q;}
      }
    }
    // A foreground island in a hole has no adjacency to the exterior's
    // 4-connected background. RETR_EXTERNAL deliberately excludes it.
    if(!external)continue;
    const contour=traceBoundary(labels,width,height,id,start,tail);
    components.push({id,start,box:[left,top,right-left+1,bottom-top+1],area:contourArea(contour),contour});
  }
  // OpenCV returns external contours in reverse raster discovery order.
  // Equal-area native std::sort ordering is not established by this research.
  components.reverse();components.sort((a,b)=>b.area-a.area);
  const selected=components.slice(0,2),mask=new Uint8Array(n);
  for(const c of selected)fillExternalComponent(mask,labels,width,c);
  const publicContour=c=>({area:c.area,box:c.box,contour:c.contour});
  return {mask,boxes:selected.map(c=>c.box),areas:selected.map(c=>c.area),
    contours:selected.map(c=>c.contour),allContours:components.map(publicContour)};
}


// Sliding window min/max with neutral constant borders (+Inf/-Inf).
function morphology(a,side,k,minimum){
 const r=(k-1)/2,tmp=new Float32Array(a.length),out=new Float32Array(a.length),q=new Int32Array(side);
 function pass(source,dest,vertical){
  for(let line=0;line<side;line++){
   let lo=0,hi=0,next=0;
   const at=t=>vertical?t*side+line:line*side+t;
   for(let t=0;t<side;t++){
    const end=Math.min(side-1,t+r);
    for(;next<=end;next++){
     const v=source[at(next)];
     while(hi>lo&&(minimum?source[at(q[hi-1])]>=v:source[at(q[hi-1])]<=v))hi--;
     q[hi++]=next;
    }
    while(hi>lo&&q[lo]<t-r)lo++;
    dest[at(t)]=source[at(q[lo])];
   }
  }
 }
 pass(a,tmp,false);pass(tmp,out,true);return out;
}
function boxBlurConstant(a,side,k=21){
 const r=(k-1)/2,tmp=new Float32Array(a.length),out=new Float32Array(a.length);
 for(let y=0;y<side;y++){
  let sum=0;for(let x=0;x<=r&&x<side;x++)sum+=a[y*side+x];
  for(let x=0;x<side;x++){tmp[y*side+x]=sum;if(x-r>=0)sum-=a[y*side+x-r];if(x+r+1<side)sum+=a[y*side+x+r+1];}
 }
 for(let x=0;x<side;x++){
  let sum=0;for(let y=0;y<=r&&y<side;y++)sum+=tmp[y*side+x];
  for(let y=0;y<side;y++){out[y*side+x]=sum/(k*k);if(y-r>=0)sum-=tmp[(y-r)*side+x];if(y+r+1<side)sum+=tmp[(y+r+1)*side+x];}
 }
 return out;
}
function roundEven(x){const lo=Math.floor(x),d=x-lo;return d<.5?lo:d>.5?lo+1:lo+(lo%2);}
function region01({side,points,head4,head6,mainMask,strength0,strength1}){
 const ids=[54,55,56,57,58,98,104,89,107,108];
 const p=args(side,points,ids,{head4,head6,mainMask},strength0);
 if(!Number.isFinite(strength1)||strength1<0||strength1>1)throw new RangeError('strength1');
 let total=0;for(const id of ids)total=f(total+p[id][0]);
 const splitX=Math.trunc(f(total/10));if(splitX<0||splitX>side)throw new RangeError('native split outside image');
 const byte=new Uint8Array(side*side);
 for(let i=0;i<byte.length;i++)byte[i]=Math.max(0,Math.min(255,roundEven(f(head4[i]*255))))>128?255:0;
 const first=topTwoContours(byte,side,side),candidate=new Uint8Array(byte.length);
 for(const [x,y,w,h]of first.boxes)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
  const i=yy*side+xx,v=f(first.mask[i]-head6[i]);
  candidate[i]=mainMask[i]>0&&(v>0?f(mainMask[i]*v):v)>f(.05)?255:0;
 }
 const retained=topTwoContours(candidate,side,side);let boxes=retained.boxes.map(([x,y,w,h])=>{
  const l=Math.max(20,x)-20,t=Math.max(20,y)-20,r=Math.min(side,x+w+20),b=Math.min(side,y+h+20);
  return [l,t,r-l,b-t];
 });
 if(boxes.length===2){
  const [a,b]=boxes;
  if(Math.max(a[0],b[0])<Math.min(a[0]+a[2],b[0]+b[2])&&Math.max(a[1],b[1])<Math.min(a[1]+a[3],b[1]+b[3])){
   const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]);boxes=[[x,y,Math.max(a[0]+a[2],b[0]+b[2])-x,Math.max(a[1]+a[3],b[1]+b[3])-y]];
  }
 }
 let shared=Float32Array.from(retained.mask);
 for(const [x,y,w,h]of boxes){const d=morphology(shared,side,21,false);forRect(side,{x0:x,y0:y,x1:x+w,y1:y+h},i=>{shared[i]=d[i];});}
 for(const [x,y,w,h]of boxes){const b=boxBlurConstant(shared,side,21);forRect(side,{x0:x,y0:y,x1:x+w,y1:y+h},i=>{shared[i]=f(b[i]*mainMask[i]);});}
 const left=new Float32Array(shared.length),right=new Float32Array(shared.length),q0=remapStrength(strength0),q1=remapStrength(strength1);
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=y*side+x;if(x<splitX)left[i]=f(shared[i]*q0);else right[i]=f(shared[i]*q1);}
 return {left,right,metadata:{splitX,firstBoxes:first.boxes,selectedBoxes:retained.boxes,processedBoxes:boxes,native:'145bce340->145bcfa40;145bcdc30',equalAreaTie:'reverse-raster stable Node order; original sort tie behavior unresolved'}};
}
function effectiveStrengths(strengths){
 if(!strengths||strengths.length!==10||!Array.from(strengths).every(s=>Number.isFinite(s)&&s>=0&&s<=1))throw new RangeError('10 strengths0..1 required');
 return Array.from(strengths,(s,i)=>[2,6,7].includes(i)?f(s):remapStrength(s));
}
function pointMap(points){
 if(points instanceof Float32Array){if(points.length!==388||!points.every(Number.isFinite))throw new RangeError('native194 point shape/finite');const p={};for(let i=0;i<194;i++)p[i]=[points[2*i],points[2*i+1]];return p;}
 if(Array.isArray(points)){if(points.length!==194||!points.every(p=>p&&p.length===2&&Array.from(p).every(v=>Number.isFinite(f(v)))))throw new RangeError('native194 point shape/finite');return points.map(p=>Array.from(p,v=>f(v)));}
 if(!points||typeof points!=='object')throw new RangeError('native194 points required');return points;
}
const POLY8=[60,61,62,63,64,58,71,70,69,68,67];
const POLY3=[[18,22,5,6,7,8],[40,36,17,16,15,14]];
function polygonRect(side,x0,y0,x1,y1){
 if(![x0,y0,x1,y1].every(Number.isInteger)||x0<0||y0<0||x1>side||y1>side||x0>x1||y0>y1)throw new RangeError('native polygon rectangle outside image');
 return {x0,y0,x1,y1};
}
function integerPoints(p){const out={};for(const [i,a]of Object.entries(p))out[i]=a.map(Math.trunc);return out;}
function drawProtection(data,side,points,lineType){
 return require('./opencv-runtime.cjs').drawPolygonByte({data,width:side,height:side,points,color:0,lineType});
}
function shape8(side,p,ratio){
 let startY=Math.max(0,p[55][1]);
 if(ratio<f(.25)||ratio>f(4))startY=Math.min(Math.max(0,p[110][1]),Math.max(0,p[140][1]));
 const x0=Math.min(side-1,p[75][0]),x1=Math.min(side-1,p[81][0]),bottom=Math.min(Math.min(side-1,p[64][1]),p[71][1]);
 let mask=new Uint8Array(side*side);
 forRect(side,polygonRect(side,0,startY,side,side),i=>{mask[i]=1;});
 forRect(side,polygonRect(side,Math.min(x0,x1),bottom,Math.max(x0,x1),side),i=>{mask[i]=0;});
 mask=drawProtection(mask,side,POLY8.map(i=>p[i]),16);
 return {mask,startY};
}
function region8({side,points,head4,head6,mainMask,strength,nativeScalar358}){
 const ids=[...new Set([...POLY8,54,55,75,81,109,110,140,141])];
 const p=integerPoints(args(side,points,ids,{head4,head6,mainMask},strength)),scalar=f(nativeScalar358);
 if(!Number.isFinite(scalar))throw new RangeError('explicit native scalar +358 required');
 const roi=polygonRect(side,0,Math.max(15,p[55][1])-15,side,side),prep=new Float32Array(mainMask.length);
 const difference=scalar<=f(3.5)||scalar>=3.51,morph=morphology(difference?head4:head6,side,11,false),threshold=scalar>=1.84||scalar<=1.83?f(.05):0;
 forRect(side,roi,i=>{const v=f((difference?Math.max(f(head6[i]-morph[i]),0):morph[i])*mainMask[i]);prep[i]=v>threshold?1:0;});
 const raw54=points[54],raw109=points[109],raw141=points[141];
 const a=[f(f(raw54[0])-f(raw109[0])),f(f(raw54[1])-f(raw109[1]))],b=[f(f(raw54[0])-f(raw141[0])),f(f(raw54[1])-f(raw141[1]))];
 const denominator=Math.sqrt(b[0]**2+b[1]**2);if(denominator===0)throw new RangeError('native ratio denominator zero');
 const ratio=f(Math.sqrt(a[0]**2+a[1]**2)/denominator),shape=shape8(side,p,ratio);
 for(let i=0;i<prep.length;i++)if(shape.mask[i]===0)prep[i]=0;
 blurInPlace(prep,side,roi,21);const q=remapStrength(strength);forRect(side,roi,i=>{prep[i]=f(f(prep[i]*mainMask[i])*q);});
 return {mask:prep,roi,ratio,shapeStartY:shape.startY,threshold,nativeScalar358:scalar,native:'145bd3970->145bcbe90;145bd3770'};
}
function shape3(side,p,nativeContextInt){
 const a=Math.max(0,p[2][1]),b=Math.min(side-1,p[114][1]),c=Math.min(side-1,p[11][1]),d=Math.min(side-1,p[136][1]);
 const boxes=[polygonRect(side,0,Math.min(a,b),Math.max(0,p[59][0]),Math.max(a,b)),polygonRect(side,Math.min(side-1,p[66][0]),Math.min(c,d),side,Math.max(c,d))];
 let mask=new Uint8Array(side*side);for(const r of boxes)forRect(side,r,i=>{mask[i]=1;});
 if(nativeContextInt<40)for(const poly of POLY3)mask=drawProtection(mask,side,poly.map(i=>p[i]),8);
 return {mask,boxes};
}
function region3({side,points,head4,head5,head7,mainMask,strength,nativeContextInt}){
 if(!Number.isInteger(nativeContextInt))throw new RangeError('explicit native context integer required');
 const ids=[...new Set([59,66,113,137,2,11,114,136,...POLY3[0],...POLY3[1]])],p=integerPoints(args(side,points,ids,{head4,head5,head7,mainMask},strength));
 const xL=Math.max(0,p[59][0]),xR=Math.min(side-1,p[66][0]),yL=Math.min(side-1,p[113][1]),yR=Math.min(side-1,p[137][1]);
 const expanded=[polygonRect(side,0,0,Math.min(side-1,xL+25),Math.min(side-1,yL+25)),polygonRect(side,Math.max(25,xR)-25,0,side,Math.min(side-1,yR+25))];
 const dilated=new Float32Array(mainMask.length).fill(5),morph=morphology(head4,side,31,false);
 for(const r of expanded)forRect(side,r,i=>{dilated[i]=morph[i];});
 let candidate=new Float32Array(mainMask.length);
 for(const r of [polygonRect(side,0,0,xL,yL),polygonRect(side,xR,0,side,yR)])forRect(side,r,i=>{
  const delta=f(head5[i]-dilated[i]);let v=delta>0?f(mainMask[i]*delta):delta;
  if(head7[i]>0)v=Math.max(v,f(mainMask[i]*head7[i]));candidate[i]=mainMask[i]>0&&v>f(.01)?1:0;
 });
 for(const r of expanded){const d=morphology(candidate,side,51,false);forRect(side,r,i=>{candidate[i]=d[i];});}
 const shape=shape3(side,p,nativeContextInt);for(let i=0;i<candidate.length;i++)if(shape.mask[i]===0)candidate[i]=0;
 const combined=new Float32Array(candidate.length),processedRectangles=[],q=remapStrength(strength);
 for(const {x0,y0,x1,y1}of shape.boxes){
  const r=polygonRect(side,Math.max(10,x0)-10,Math.max(10,y0)-10,Math.min(side-1,x1+10),Math.min(side-1,y1+10));processedRectangles.push(r);
  blurInPlace(candidate,side,r,21);forRect(side,r,i=>{candidate[i]=f(f(candidate[i]*mainMask[i])*q);combined[i]=Math.max(combined[i],candidate[i]);});
 }
 return {mask:combined,rectangles:shape.boxes,processedRectangles,nativeContextInt,native:'145bd04b0->145bca470;145bdcd70',workerThreshold:f(.01)};
}
function initializeOpenCV(){return require('./opencv-runtime.cjs').initializeOpenCV();}
function mixRegions(options){
 const {side,heads9,mainMask,points,strengths,nativeContextInt,nativeRegion7ProtectionFlag,nativeRegion9ProtectionFlag,nativeScalar358}=options;
 if(Object.prototype.hasOwnProperty.call(options,'nativeProtectionFlag'))throw new RangeError('legacy nativeProtectionFlag is ambiguous; provide independent region7/region9 flags');
 if(![768,1024].includes(side))throw new RangeError('native main side');
 if(!Number.isInteger(nativeContextInt))throw new RangeError('explicit native context integer required');
 if(typeof nativeRegion7ProtectionFlag!=='boolean')throw new RangeError('explicit native region7 protection flag required');
 if(typeof nativeRegion9ProtectionFlag!=='boolean')throw new RangeError('explicit native region9 protection flag required');
 if(!Number.isFinite(nativeScalar358))throw new RangeError('explicit native scalar +358 required');
 const n=side*side;
 if(!(mainMask instanceof Float32Array)||mainMask.length!==n||!mainMask.every(Number.isFinite))throw new RangeError('mainMask shape/finite');
 const heads=heads9 instanceof Float32Array&&heads9.length===9*n?Array.from({length:9},(_,i)=>heads9.subarray(i*n,(i+1)*n)):heads9;
 if(!Array.isArray(heads)||heads.length!==9||heads.some(a=>!(a instanceof Float32Array)||a.length!==n||!a.every(Number.isFinite)))throw new RangeError('9 finite float32 native heads required');
 const p=pointMap(points),effective=effectiveStrengths(strengths),activeSlots=effective.map((q,i)=>q>.001&&i!==4?i:-1).filter(i=>i>=0),regions={},metadata=[];
 const base={side,points:p,mainMask,nativeContextInt,nativeScalar358};
 if(activeSlots.includes(0)||activeSlots.includes(1)){
  const r=region01({...base,head4:heads[4],head6:heads[6],strength0:activeSlots.includes(0)?f(strengths[0]):0,strength1:activeSlots.includes(1)?f(strengths[1]):0});
  for(const slot of [0,1])if(activeSlots.includes(slot)){regions[slot]=slot===0?r.left:r.right;metadata.push({slot,...r.metadata});}
 }
 for(const slot of activeSlots){
  if(slot<2)continue;
  const input={...base,strength:f(strengths[slot])};for(let i=0;i<9;i++)input['head'+i]=heads[i];
  // Original caller: slot7 receives the first-face attributes5..8 argmax==id6;
  // slot9 independently reads the current face+224 byte-mask ratio flag.
  if(slot===7)input.nativeProtectionFlag=nativeRegion7ProtectionFlag;
  if(slot===9)input.nativeProtectionFlag=nativeRegion9ProtectionFlag;
  const r=({2:region2,3:region3,5:region5,6:region6,7:region7,8:region8,9:region9})[slot](input);regions[slot]=r.mask;
  const {mask,...m}=r;metadata.push({slot,...m,...(slot===7?{nativeRegion7ProtectionFlag}:slot===9?{nativeRegion9ProtectionFlag}:{})});
 }
 const mixedMask=new Float32Array(n);for(const a of Object.values(regions))for(let i=0;i<n;i++)mixedMask[i]=Math.max(mixedMask[i],a[i]);
 return {mixedMask,regions,activeSlots,effectiveStrengths:effective,metadata};
}
module.exports={mixRegions,initializeOpenCV,effectiveStrengths,remapStrength,region01,region2,region3,region5,region6,region7,region8,region9,topTwoContours,boxBlur,morphology,shape3,shape8};
