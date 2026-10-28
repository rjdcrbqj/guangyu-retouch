'use strict';
// Research backend derived solely from installed original-package UCRTacosf numeric instructions.
// Finite FLOAT [-1,1] only; does not emulate errno/matherr/FPstatus or assert protected IAT binding.
const f=Math.fround,view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x,true);return view.getUint32(0,true);},fromBits=x=>{view.setUint32(0,x>>>0,true);return view.getFloat32(0,true);};
const values=new Map([[6443292616,1.5707963705062866],[6443264880,1.0],[6443293352,-1.0],[6443293032,3.1415927410125732],[6443293632,-0.0],[6443264880,1.0],[6443292140,0.5],[6443240940,-0.013381929136812687],[6443240920,0.003961374517530203],[6443240936,1.1049696207046509],[6443240924,0.05652986839413643],[6443240928,0.18416160345077515],[6443240932,0.8364112973213196],[6443240816,6.123233995736766e-17],[6443292936,3.141592653589793],[6443292896,2.0],[6443240816,6.123233995736766e-17],[6443292888,1.5707963267948966]]);const c=a=>values.get(a);
function bundledAcosfCandidate(input){
 if(typeof input!=='number'||!Number.isFinite(input)||!Number.isFinite(f(input)))throw new TypeError('finite FLOAT input required');const x=f(input);if(x < -1||x>1)throw new RangeError('research finite domain [-1,1] only');const b=bits(x),exp=(b>>>23)&255,negative=(b>>>31)!==0;
 if(exp<101)return c(0x1800cd7c8);if(x===1)return 0;if(x===-1)return c(0x1800cd968);
 let a=negative?-x:x,z,s=0;if(exp>=126){z=f(f(c(0x1800c6b70)-a)*c(0x1800cd5ec));s=f(Math.sqrt(z));a=s;}else z=f(a*a);
 let p=f(c(0x1800c0dec)-f(z*c(0x1800c0dd8)));p=f(p*z);p=f(p-c(0x1800c0ddc));p=f(p*z);p=f(p+c(0x1800c0de0));p=f(p*z);const q=f(c(0x1800c0de8)-f(z*c(0x1800c0de4)));p=f(p/q);
 if(exp<126){p=f(p*x);const split=c(0x1800c0d70)-p;const argument=x-split;return f(c(0x1800cd8d8)-argument);}
 if(negative){p=f(p*a);let split=p-c(0x1800c0d70);split=split+s;split=split+split;return f(c(0x1800cd908)-split);}
 let doubled=f(a+a),truncated=fromBits(bits(s)&0xffff0000),prod=f(truncated*truncated),den=f(truncated+s),base=f(truncated*c(0x1800cd8e0)),correction=f(z-prod);doubled=f(doubled*p);correction=f(correction/den);correction=f(correction+correction);doubled=f(doubled+correction);return f(doubled+base);
}
export {bundledAcosfCandidate,bits,fromBits};
