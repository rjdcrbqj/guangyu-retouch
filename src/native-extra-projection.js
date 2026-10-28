// Recovered 1460b6e70 scissor arithmetic, literal-one corners.
const f=Math.fround;
export function scissor(normalized,maskWidth,maskHeight,outputWidth,outputHeight){
 const n=normalized,mw=f(maskWidth),mh=f(maskHeight),ow=f(outputWidth),oh=f(outputHeight),trunc=v=>{const t=Math.trunc(v);return t===0?0:t;};
 //1460b6e70 actual corners: [0,0], [1,H], [W,1], [W,H]. Preserve literal1.
 const corners=[[trunc(f(n[2]*ow)),trunc(f(n[5]*oh))],[trunc(f(f(f(f(n[1]*mh)+n[0])+n[2])*ow)),trunc(f(f(f(f(n[4]*mh)+n[3])+n[5])*oh))],[trunc(f(f(f(f(n[0]*mw)+n[1])+n[2])*ow)),trunc(f(f(f(f(n[3]*mw)+n[4])+n[5])*oh))],[trunc(f(f(f(f(n[0]*mw)+f(n[1]*mh))+n[2])*ow)),trunc(f(f(f(f(n[3]*mw)+f(n[4]*mh))+n[5])*oh))]];
 const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return [x,y,Math.max(...xs)-x,Math.max(...ys)-y];
}
