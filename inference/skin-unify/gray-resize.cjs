'use strict';
const F=Math.fround;
function even(x){const a=Math.floor(x),t=x-a;return t<.5?a:t>.5?a+1:(a%2===0?a:a+1);}
function horizontal(rows,xofs,alpha,cn,xmax){
 if(![1,2,3,4].includes(cn)||rows.length<1||rows.length>4||xofs.length>384||alpha.length!==2*xofs.length||xmax<0||xmax>xofs.length)throw Error('bounded H ABI');
 for(let i=0;i<xofs.length;i++)if(alpha[2*i]<0||alpha[2*i+1]<0||alpha[2*i]+alpha[2*i+1]!==2048)throw Error('alpha domain');
 return rows.map(r=>xofs.map((x,i)=>{if(x<0||x+(i<xmax?cn:0)>=r.length)throw Error('xofs bounds');return i<xmax?r[x]*alpha[2*i]+r[x+cn]*alpha[2*i+1]:r[x]*2048;}));
}
function vertical(rows,beta){
 if(rows.length!==2||rows[0].length!==rows[1].length||rows[0].length>384||beta.length!==2||beta[0]<0||beta[1]<0||beta[0]+beta[1]!==2048)throw Error('bounded V ABI');
 return rows[0].map((s,i)=>{const t=rows[1][i];if(s<0||s>522240||t<0||t>522240)throw Error('H domain');return ((((s>>4)*beta[0])>>16)+(((t>>4)*beta[1])>>16)+2)>>2;});
}
// Original kernel static evidence: F64 position, F32 conversion before fraction;
// cvttss2si(positionF32) with F32 comparison floor correction; F32 coefficients and cvtss2si.
function axis(src,dst,cn=1,horizontalAxis=true){
 // 自有服务允许32766边长；原有限fixture到8192，扩展轴范围仍为静态候选。
 if(!Number.isInteger(src)||!Number.isInteger(dst)||src<1||src>32766||dst<1||dst>128)throw Error('axis bounds');
 const scale=1/(dst/src),indices=[],alpha=[];let xmax=dst*cn;
 for(let dx=0;dx<dst;dx++){
  const d=(dx+.5)*scale-.5,p=F(d);let s=Math.trunc(p)-(p<F(Math.trunc(p))?1:0),fraction=F(p-F(s));
  if(horizontalAxis&&s<0){s=0;fraction=0;}
  if(horizontalAxis&&s>=src-1){s=src-1;fraction=0;xmax=Math.min(xmax,dx*cn);}
  const a0=even(F(F(1-fraction)*2048)),a1=even(F(fraction*2048));
  for(let c=0;c<cn;c++){indices.push(s*cn+c);alpha.push(a0,a1);}
 }
 return {indices,alpha,xmax,scale};
}
function linear32Plan(width,height){
 if(width===64&&height===64)throw Error('mode 3 exact 2x2 area branch remains Unknown');
 return {x:axis(width,32,3,true),y:axis(height,32,1,false),width,height};
}
function linear32(rgb,width,height){
 const p=linear32Plan(width,height);if(rgb.length!==width*height*3)throw Error('source geometry');
 const output=[];
 for(let dy=0;dy<32;dy++){
  const sy=p.y.indices[dy],row0=Math.max(0,Math.min(height-1,sy)),row1=Math.max(0,Math.min(height-1,sy+1));
  const rows=[row0,row1].map(y=>Array.from(rgb.slice(y*width*3,(y+1)*width*3)));
  output.push(...vertical(horizontal(rows,p.x.indices,p.x.alpha,3,p.x.xmax),p.y.alpha.slice(2*dy,2*dy+2)));
 }
 return output;
}
module.exports={horizontal,vertical,axis,linear32Plan,linear32,even,scope:'Finite BYTE H/V native-proven; geometry static candidate; mode3/wholeMat/wholeResize Unknown'};
if(require.main===module){const fs=require('fs'),fixtures=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));let fields=0;for(const f of fixtures){const a=f.kind==='H'?horizontal(f.rows,f.xofs,f.alpha,f.cn,f.xmax):vertical(f.rows,f.beta);if(JSON.stringify(a)!==JSON.stringify(f.expected))throw Error('fixture mismatch');fields+=f.kind==='H'?a.reduce((n,r)=>n+r.length,0):a.length;}console.log(JSON.stringify({pass:true,cases:fixtures.length,fields,mismatch:0}));}
