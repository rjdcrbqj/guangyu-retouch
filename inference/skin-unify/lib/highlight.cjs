'use strict';
// Research only: original bounded raster/queue and serial triangle callback candidates.
const f=Math.fround;
function check(data,w,h){if(!(data instanceof Uint8Array)||!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||data.length!==w*h)throw new TypeError('explicit BYTE w*h expected');}
function reconstructBaseline({source,marker,width:w,height:h,mode=8}){
 check(source,w,h);check(marker,w,h);if(mode!==4&&mode!==8)throw new RangeError('original mode4/8 only');const s=w+2,g=new Uint8Array(s*(h+2)),v=new Uint8Array(g.length);
 for(let y=0;y<h;y++){g.set(source.subarray(y*w,(y+1)*w),(y+1)*s+1);v.set(marker.subarray(y*w,(y+1)*w),(y+1)*s+1);}
 const forward=mode===4?[-1,-s]:[-1,-s-1,-s,-s+1],backward=mode===4?[1,s]:[1,s-1,s,s+1],neighbours=mode===4?[-s,-1,1,s]:[-s-1,-s,-s+1,-1,1,s-1,s,s+1];const cap=Math.floor(w*h/2),q=new Int32Array(cap);let count=0;
 for(let y=1;y<=h;y++)for(let x=1;x<=w;x++){const i=y*s+x;let max=v[i];for(const d of forward)max=Math.max(max,v[i+d]);v[i]=Math.min(g[i],max);}
 for(let y=h;y>0;y--)for(let x=w;x>0;x--){const i=y*s+x;let max=v[i];for(const d of backward)max=Math.max(max,v[i+d]);v[i]=Math.min(g[i],max);if(backward.some(d=>v[i+d]<v[i]&&v[i+d]<g[i+d])){if(count>=cap)break;q[count++]=i;}}
 for(let at=0;at<count;at++){const i=q[at],value=v[i];for(const d of neighbours){const j=i+d;if(v[j]<value&&v[j]!==g[j]){v[j]=Math.min(value,g[j]);if(count<cap)q[count++]=j;}}}
 const out=new Uint8Array(w*h);for(let y=0;y<h;y++)out.set(v.subarray((y+1)*s+1,(y+1)*s+1+w),y*w);return {data:out,queueLength:count,queueCapacity:cap};
}
function triangleBlur({data,width:w,height:h,radius:r}){
 check(data,w,h);if(!Number.isInteger(r)||r<1||r>64)throw new RangeError('explicit finite research radius1..64');const den=(r+1)**2,tmp=new Uint8Array(w*h),out=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-r;k<=r;k++)sum+=(r+1-Math.abs(k))*data[y*w+Math.max(0,Math.min(w-1,x+k))];tmp[y*w+x]=Math.floor(sum/den);}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-r;k<=r;k++)sum+=(r+1-Math.abs(k))*tmp[Math.max(0,Math.min(h-1,y+k))*w+x];out[y*w+x]=Math.floor(sum/den);}return out;
}
function scaledROI({roi,sourceWidth,sourceHeight,sourceMetadata30,contextSide}){
 if(!Array.isArray(roi)||roi.length!==4||!roi.every(v=>Number.isFinite(v)&&Number.isFinite(f(v)))||![sourceWidth,sourceHeight,sourceMetadata30,contextSide].every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647)||sourceWidth<1||sourceHeight<1||contextSide<1)throw new TypeError('explicit finite ROI/source inputs');
 const sourceSide=sourceMetadata30>=5?sourceHeight:sourceWidth,scale=f(f(sourceSide)/f(contextSide)),rect=roi.map(v=>{const n=f(f(scale*f(v))+.5);if(!Number.isFinite(n)||n < -2147483648||n>=2147483648)throw new RangeError('research excludes cvtt invalid/out-of-int32');return Math.trunc(n);}),[x,y,w,h]=rect;
 if(x+w < -2147483648||x+w>2147483647||y+h < -2147483648||y+h>2147483647)throw new RangeError('research excludes native signed-add overflow');return {scale,rect,valid:x>=0&&y>=0&&w>1&&h>1&&x+w<sourceWidth&&y+h<sourceHeight};
}
function maskFromGray({data,side,threshold,radius}){
 if(side!==200)throw new RangeError('only actual200 caller candidate');check(data,side,side);if(!Number.isInteger(threshold)||threshold < -2147483648||threshold>2147483647||!Number.isInteger(radius)||radius<0||radius>2147483647)throw new TypeError('explicit integer threshold/radius');const n=side+2,source=new Uint8Array(n*n).fill(255),marker=new Uint8Array(n*n).fill(255);
 for(let y=0;y<side;y++){source.set(data.subarray(y*side,(y+1)*side),(y+1)*n+1);marker.fill(0,(y+1)*n+1,(y+1)*n+1+side);}
 const baseline=reconstructBaseline({source,marker,width:n,height:n,mode:8}).data,raw=new Uint8Array(side*side);for(let y=0;y<side;y++)for(let x=0;x<side;x++)raw[y*side+x]=data[y*side+x]-baseline[(y+1)*n+1+x]>=threshold?255:0;
 const effectiveRadius=radius>0?Math.min(radius,Math.floor((Math.floor(side/2)-1)/2)):0,mask=effectiveRadius>0?triangleBlur({data:raw,width:side,height:side,radius:effectiveRadius}):raw;const rgba=new Uint8Array(side*side*4);for(let i=0;i<mask.length;i++){rgba[4*i]=rgba[4*i+1]=rgba[4*i+2]=mask[i];rgba[4*i+3]=255;}return {baseline202:baseline,thresholdMask:raw,mask,rgba,effectiveRadius};
}
module.exports={reconstructBaseline,triangleBlur,scaledROI,maskFromGray};

