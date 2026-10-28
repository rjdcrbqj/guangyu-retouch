// Independent finite research candidates. No product/native runtime imports.
const f=Math.fround;
const roundEven=x=>{const n=Math.floor(x),d=x-n;return d<.5?n:d>.5?n+1:(n&1)?n+1:n;};
function scaleFloat3({data,strength}) {const s=f(strength),o=new Float32Array(data.length);for(let i=0;i<o.length;i++)o[i]=f(f(data[i]*s)+0);return o;}
function translateInverse({inverse,template,roi}) {const m=Float32Array.from(inverse),[x,y]=template.map(f),[rx,ry]=roi.map(f);m[2]=f(f(f(f(m[0]*x)+f(m[1]*y))+m[2])-rx);m[5]=f(f(f(f(m[3]*x)+f(m[4]*y))+m[5])-ry);return m;}
function inverseDouble(matrix) {const m=Array.from(matrix,f),det=m[0]*m[4]-m[1]*m[3],r=det!==0?1/det:0,a=m[4]*r,e=m[0]*r,b=m[1]*(-r),d=m[3]*(-r);return new Float64Array([a,b,(-a)*m[2]-b*m[5],d,e,(-d)*m[2]-e*m[5]]);}
function warpByte3({data,width,height,matrix,targetWidth,targetHeight,table}) {
 const m=inverseDouble(matrix),o=new Uint8Array(targetWidth*targetHeight*3),xy=new Int16Array(targetWidth*targetHeight*2),alpha=new Uint16Array(targetWidth*targetHeight),deltas=new Int32Array(targetWidth*2);
 for(let x=0;x<targetWidth;x++){deltas[x]=roundEven(m[0]*x*1024);deltas[targetWidth+x]=roundEven(m[3]*x*1024);}
 for(let y=0;y<targetHeight;y++){const bx=(roundEven((m[1]*y+m[2])*1024)+16)|0,by=(roundEven((m[4]*y+m[5])*1024)+16)|0;
  for(let x=0;x<targetWidth;x++){const i=y*targetWidth+x,xx=(bx+deltas[x])|0,yy=(by+deltas[targetWidth+x])|0,sx=Math.max(-32768,Math.min(32767,xx>>10)),sy=Math.max(-32768,Math.min(32767,yy>>10)),phase=((xx>>5)&31)|(((yy>>5)&31)<<5);xy[i*2]=sx;xy[i*2+1]=sy;alpha[i]=phase;
   for(let c=0;c<3;c++){let sum=0;for(let j=0;j<4;j++){const px=sx+(j&1),py=sy+(j>>1),v=px<0||px>=width||py<0||py>=height?80:data[(py*width+px)*3+c];sum+=v*table[phase*4+j];}o[i*3+c]=Math.max(0,Math.min(255,(sum+16384)>>15));}
  }
 }
 return {data:o,inverse:m,deltas,xy,alpha};
}
function neutral80({data,mask,mode='scalar'}) {if(!['scalar','sse'].includes(mode))throw Error('explicit mode');const out=new Uint8Array(data),prefix=mode==='sse'?(mask.length&~7):0,k=.0039215686,kf=f(k);
 for(let i=0;i<mask.length;i++){const vector=i<prefix,w=vector?f(mask[i]*kf):f(mask[i]*k);if(!vector&&!mask[i])continue;for(let c=0;c<3;c++){const j=i*3+c,v=f(f(f(80*w)-f(w*data[j]))+data[j]);out[j]=vector?Math.floor(v):Math.trunc(v);}}return out;}
function metadata({data,mode='sse'}) {const n=data.length/3,changed=new Uint8Array(n),magnitude=new Uint8Array(n),hi=mode==='scalar'?81:80;for(let i=0;i<n;i++){const j=i*3,L=(data[j]*3735+data[j+1]*19235+data[j+2]*9798+16384)>>15;changed[i]=L<80||L>hi?255:0;magnitude[i]=Math.abs(L-80);}return {changed,magnitude};}
function maximum(a,b){const out=new Uint8Array(a.length);for(let i=0;i<out.length;i++)out[i]=Math.max(a[i],b[i]);return out;}
function copyROI({data,global,width,height,roi}) {const [x,y,w,h]=roi,out=new Uint8Array(global);for(let j=0;j<h;j++)out.set(data.subarray(j*w*3,(j+1)*w*3),((y+j)*width+x)*3);return out;}
function pasteTwo({source,width,height,channels,regions}) {const out=new Uint8Array(source);for(const {data,roi} of regions){const[x,y,w,h]=roi;if(w<=0||h<=0)continue;for(let j=0;j<h;j++)for(let i=0;i<w;i++)for(let c=0;c<3;c++){const p=((y+j)*width+x+i)*channels+c;out[p]=Math.max(0,Math.min(255,out[p]+data[(j*w+i)*3+c]-80));}}return out;}
module.exports={scaleFloat3,translateInverse,inverseDouble,warpByte3,neutral80,metadata,maximum,copyROI,pasteTwo,roundEven};
