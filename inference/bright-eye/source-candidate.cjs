// Research only: fixed-point grayscale and INTER_LINEAR BYTE branch recovered from original bodies.
const f = Math.fround;
function roundEven(x) {const n=Math.floor(x),r=x-n;return r<.5?n:r>.5?n+1:(n&1)?n+1:n;}
function gray({data,width,height,channels,srcStep=width*channels,dstStep=width,swap=true}) {
 if (![3,4].includes(channels)) throw new RangeError('channels 3/4');
 const out=new Uint8Array(dstStep*height);out.fill(173);
 const c=swap?[9798,19235,3735]:[3735,19235,9798];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {const p=y*srcStep+x*channels;out[y*dstStep+x]=(data[p]*c[0]+data[p+1]*c[1]+data[p+2]*c[2]+16384)>>>15;}
 return out;
}
function axis(src,dst,horizontal) {
 // Original wrapper computes DOUBLE dst/src; dispatcher reciprocates it.
 const scale=1/(dst/src),coords=new Int32Array(dst),weights=new Int16Array(dst*2);
 for(let d=0;d<dst;d++) {let v=f((d+.5)*scale-.5),s=Math.floor(v),frac=f(v-f(s));
  if(horizontal && s<0) {s=0;frac=0;}
  if(horizontal && s>=src-1) {s=src-1;frac=0;}
  coords[d]=s;weights[d*2]=roundEven(f(f(1-frac)*2048));weights[d*2+1]=roundEven(f(frac*2048));
 }
 return {coords,weights};
}
function resize({data,width,height,targetWidth,targetHeight,srcStep=width,dstStep=targetWidth}) {
 for(const v of [width,height,targetWidth,targetHeight])if(!Number.isSafeInteger(v)||v<1)throw new RangeError('positive sizes');
 const out=new Uint8Array(dstStep*targetHeight);out.fill(173);
 if(width===targetWidth&&height===targetHeight) {
  for(let y=0;y<height;y++)out.set(data.subarray(y*srcStep,y*srcStep+width),y*dstStep);return out;
 }
 if(width===targetWidth*2 && height===targetHeight*2) {
  for(let y=0;y<targetHeight;y++)for(let x=0;x<targetWidth;x++) {const p=(y*2)*srcStep+x*2;out[y*dstStep+x]=(data[p]+data[p+1]+data[p+srcStep]+data[p+srcStep+1]+2)>>>2;}return out;
 }
 const ax=axis(width,targetWidth,true),ay=axis(height,targetHeight,false);
 for(let y=0;y<targetHeight;y++) {const sy=ay.coords[y],b0=ay.weights[y*2],b1=ay.weights[y*2+1];const r0=Math.max(0,Math.min(height-1,sy))*srcStep,r1=Math.max(0,Math.min(height-1,sy+1))*srcStep;
  for(let x=0;x<targetWidth;x++) {const sx=ax.coords[x],a0=ax.weights[x*2],a1=ax.weights[x*2+1],sx1=Math.min(width-1,sx+1);const h0=data[r0+sx]*a0+data[r0+sx1]*a1,h1=data[r1+sx]*a0+data[r1+sx1]*a1;
   out[y*dstStep+x]=((((h0>>>4)*b0)>>>16)+(((h1>>>4)*b1)>>>16)+2)>>>2;
  }
 }
 return out;
}
function scaledROI({roi,sourceWidth,sourceHeight,contextSide,signedMetadata}) {
 const ratio=f(f(signedMetadata>4?sourceHeight:sourceWidth)/f(contextSide));
 const out=roi.map(v=>Math.trunc(f(f(f(v)*ratio)+f(.5))));const [x,y,w,h]=out;
 return {ratio,roi:out,valid:x>=0&&y>=0&&w>1&&h>1&&x+w<sourceWidth&&y+h<sourceHeight};
}
module.exports={gray,axis,resize,scaledROI,roundEven};
