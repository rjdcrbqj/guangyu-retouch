'use strict';
const f=Math.fround,t=v=>Math.trunc(v)|0;
function eyeROIs(points,quality){
 if(!Array.isArray(points)||points.length!==194||quality.length!==142)throw new RangeError('explicit 194 points/142 quality required');
 const p=points.map(a=>a.map(f)),q=Array.from(quality,f);
 if(!p.every(a=>a.length===2&&a.every(Number.isFinite))||!q.every(Number.isFinite))throw new RangeError('finite F32 domain required');
 if(p.some(a=>a.some(v=>Math.abs(v)>=10000)))throw new RangeError('bounded finite ROI domain required');
 const low=(a)=>q.slice(a,a+4).every(v=>v<.1);
 const lq=low(22),rq=low(40),ly=t(f(Math.min(p[54][1],p[109][1],...p.slice(18,23).map(a=>a[1]))+10));
 const lw=t(Math.max(f(p[54][0]-p[161][0]),f(p[58][1]-p[54][1])));
 const left=t(f(p[54][0]-p[109][0]))<57||lq||ly<0||lw<0?null:[t(p[161][0]),ly,lw,(lw*3)>>2];
 const ry=t(f(Math.min(p[141][1],p[54][1],...p.slice(18,23).map(a=>a[1]))+10));
 const rw=t(Math.max(f(p[58][1]-p[54][1]),f(f(p[9][0]-p[54][0])+4)));
 const xa=t(p[72][0])+5,rx=t(Math.max(...p.slice(136,141).map(a=>a[1]))-xa)>=t(Math.max(-1,rw)*.8)?xa:t(p[72][0])-25;
 const right=t(f(p[141][0]-p[54][0]))<57||rq||ry<0||rw<0?null:[rx,ry,rw,(rw*3)>>2];
 const ax=t(p[0][0]),bx=t(p[18][0]),ay=t(p[18][1]),by=t(p[36][1]),raw=t(f(p[142][0]-p[0][0]));
 const status=(ax<41&&bx<41)||(ay<21&&by<21)||raw< -48?1:0;
 const secondary=status?null:[(ax>=41&&bx>=41?Math.min(ax,bx):Math.max(ax,bx))-40,(ay>=21&&by>=21?Math.min(ay,by):Math.max(ay,by))-20,raw+50,(raw+50)>>>1];
 const rects={left,right,secondary},mats={};
 for(const [name,r]of Object.entries(rects)){
  if(r&&!(r[0]>=0&&r[1]>=0&&r[2]>=0&&r[3]>=0&&r[0]+r[2]<=1024&&r[1]+r[3]<=1024))throw new RangeError(`${name} exceeds original Mat ROI ABI domain`);
  mats[name]=name==='secondary'&&status?null:r&&r[2]&&r[3]?[r[3],r[2]]:[0,0];
 }
 return {status,rects,mats,rightQualityLowByte:rq?1:0};
}
function modelPlan(rects,flags=[false,false],returns={}){
 const models=[],result=n=>{models.push(n);return returns[n]||0;};
 if(flags[0]&&flags[1]){let e=result('combined-primary');if(e)return {status:e,models};e=result('alternate-secondary');return {status:e,models};}
 for(const [name,key] of [['left','primary-left'],['right','primary-right']]){const r=rects[name];if(r&&r[2]&&r[3]){const e=result(key);if(e)return {status:e,models};}}
 return {status:result('secondary'),models};
}
module.exports={eyeROIs,modelPlan};


