// Actual 1460af020 fourth-FLOAT +0 route only. No original application/GL claim.
import {coefficients,evaluate,eyeSpline} from './spline-candidate.mjs';
const f=Math.fround,add=(a,b)=>f(a+b),sub=(a,b)=>f(a-b),mul=(a,b)=>f(a*b),div=(a,b)=>f(a/b);
const midpoint=(a,b)=>a.map((v,i)=>mul(add(v,b[i]),.5));
const delta=(a,b)=>a.map((v,i)=>sub(v,b[i]));
const plus=(a,b)=>a.map((v,i)=>add(v,b[i]));
function distanceSquared(a,b){const d=delta(a,b);return add(mul(d[0],d[0]),mul(d[1],d[1]));}
function arcSpline(points){
 const knots=new Float32Array(points.length);
 for(let i=1;i<points.length;i++){knots[i]=add(f(Math.sqrt(distanceSquared(points[i],points[i-1]))),knots[i-1]);if(!(knots[i]>knots[i-1]))throw new Error('degenerate original spline knots');}
 const x=coefficients(knots,Float32Array.from(points,p=>p[0])),y=coefficients(knots,Float32Array.from(points,p=>p[1]));
 return {knots,at:t=>[evaluate(x,t),evaluate(y,t)]};
}
function halfKnots(points){const s=arcSpline(points),out=[points[0]];for(let i=1;i<points.length;i++){out.push(s.at(mul(add(s.knots[i-1],s.knots[i]),.5)));out.push(points[i]);}return out;}
function uniformInterior(points,n){const s=arcSpline(points),step=div(sub(s.knots.at(-1),s.knots[0]),f(n+1));return Array.from({length:n},(_,i)=>s.at(add(mul(f(i+1),step),s.knots[0])));}
function perSegment(points,weights){const s=arcSpline(points),out=[];for(let i=1;i<points.length;i++)for(const w of weights[i-1])out.push(s.at(add(mul(f(w),sub(s.knots[i],s.knots[i-1])),s.knots[i-1])));return out;}
const pairs=flat=>Array.from({length:flat.length/2},(_,i)=>[flat[2*i],flat[2*i+1]]);

export function expand194(source){
 if(source.length!==388)throw new Error('requires exactly194 interleaved FLOATxy points');
 const p=pairs(Float32Array.from(source));if(p.some(q=>q.some(v=>!Number.isFinite(v))))throw new Error('requires finite source194');
 const o=[],stageCounts=[];const append=points=>o.push(...points);const range=(a,b)=>p.slice(a,b+1);
 const L0=distanceSquared(p[109],p[18]),L1=distanceSquared(p[110],p[18]);
 const R0=distanceSquared(p[141],p[36]),R1=distanceSquared(p[140],p[36]);
 const left=L1!==0&&div(f(Math.sqrt(L0)),f(Math.sqrt(L1)))>=1.5?1:0;
 const right=R0!==0&&div(f(Math.sqrt(R0)),f(Math.sqrt(R1)))>=1.5?-1:0;
 const selectors=[left,right];
 // 1460e2920: copied brow vertices plus outward-biased derived points.
 function browDerived(a,b,c,d){const m=midpoint(b,c),outer=midpoint(a,d),center=midpoint(outer,m);return plus(m,delta(m,center).map(v=>mul(v,.5)));}
 append(range(0,4));o.push(browDerived(p[3],p[4],p[5],p[6]));append(range(5,13));o.push(browDerived(p[12],p[13],p[14],p[15]));append(range(14,17));stageCounts.push(o.length);
 // 1460e2b10/3840: two independently fitted open arcs, retaining raw endpoints.
 append(halfKnots(range(18,22)));append(halfKnots([...range(22,25),p[18]]).slice(1));o[o.length-1]=p[26];stageCounts.push(o.length);
 append(halfKnots(range(36,40)));append(halfKnots([...range(40,43),p[36]]).slice(1));o[o.length-1]=p[44];stageCounts.push(o.length);
 // 1460e4570/4740 depend on earlier derived brow positions.
 o.push(midpoint(o[5],o[15]));append(range(54,72));stageCounts.push(o.length);
 append(range(73,106));stageCounts.push(o.length);
 append(pairs(eyeSpline([midpoint(p[73],p[63]),midpoint(p[78],p[58]),midpoint(p[83],p[70])],2)));append(range(109,164));stageCounts.push(o.length);
 // The actual +0 branch uses uniform interior samples. +/-25 branches excluded.
 function sideStage(isLeft,shift){
  const auxiliary=isLeft?[111,112,113,114]:[139,138,137,136];
  const main=isLeft?[60,61,62,63]:[67,68,69,70];
  o.push(midpoint(p[(isLeft?109:141)+shift],p[isLeft?18:36]));
  const counts=[5,4,3,3];for(let i=0;i<4;i++){const a=p[auxiliary[i]+shift],b=p[main[i]];append(uniformInterior([a,midpoint(b,a),b],counts[i]));}
  function thirds(a,b){const step=delta(b,a).map(v=>div(v,3));o.push(plus(a,step));o.push(plus(a,step.map(v=>add(v,v))));}
  thirds(p[(isLeft?116:134)+shift],o[isLeft?108:114]);
  thirds(p[(isLeft?118:132)+shift],p[isLeft?73:83]);
 }
 sideStage(true,left);stageCounts.push(o.length);sideStage(false,right);stageCounts.push(o.length);
 // 1460e5d90: two five-control splines, discard each first/last endpoint.
 const a=p[122+left],b=p[128+right];
 const da=delta(p[92],a).map(v=>mul(v,f(.3333))),db=delta(p[86],b).map(v=>mul(v,f(.3333)));
 append(pairs(eyeSpline([o[189],plus(a,da),p[108],plus(b,db),o[209]],1)).slice(1,-1));
 append(pairs(eyeSpline([o[190],plus(a,da.map(v=>add(v,v))),p[107],plus(b,db.map(v=>add(v,v))),o[210]],1)).slice(1,-1));stageCounts.push(o.length);
 // 1460e6090: per-segment arc weights selected by actual fourth-FLOAT +0.
 const groups=[
  {controls:[p[158],p[193],p[148]],weights:[[0,.33,.67],[0,.33,.67,1]]},
  {controls:[p[160],p[192],p[146]],weights:[[0,.25,.5,.75],[0,.25,.5,.75,1]]},
  {controls:[p[162],p[191],p[144]],weights:[[0,.2,.4,.6,.8],[0,.2,.4,.6,.8,1]]}
 ];
 for(const g of groups)append(perSegment(g.controls,g.weights).slice(1,-1));stageCounts.push(o.length);
 // 1460e2000 final non-overlapping SIMD branch: three 56-point radial groups.
 for(const scale of [.1,.22,.35])for(let i=109;i<=164;i++)o.push(p[i].map((v,k)=>add(mul(sub(v,p[54][k]),f(scale)),v)));stageCounts.push(o.length);
 const points=Float32Array.from(o.flat());if(points.length!==828||points.some(v=>!Number.isFinite(v)))throw new Error('nonfinite or incorrect expansion');
 return {points,selectors,stageCounts};
}
