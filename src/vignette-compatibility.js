// WebGL language/storage adapters. Original fragment arithmetic stays intact.
export function constantCurveIndices(source,embedded=false){
 const inv=embedded?'lo':'u_acr3_inv',fwd=embedded?'kJ':'u_acr3_fwd';
 const select=(name,table)=>`vec4 ${name}(int i){${Array.from({length:32},(_,i)=>`if(i==${i})return ${table}[${i}];`).join('')}return ${table}[32];}\n`;
 const marker=embedded?'vec3 lp(vec3 d)':'vec3 srgb_to_linear(vec3 c)';
 if(!source.includes(marker))throw Error('Unexpected original shader');
 let out=source.replace(marker,select('indexedCurveInv',inv)+select('indexedCurveFwd',fwd)+marker);
 for(const [before,after] of embedded? [['lo[v]','indexedCurveInv(v)'],['kJ[v]','indexedCurveFwd(v)']]:[['u_acr3_inv[q]','indexedCurveInv(q)'],['u_acr3_fwd[q]','indexedCurveFwd(q)']]){
  if(out.split(before).length!==2)throw Error('Unexpected original array fetch count');out=out.replace(before,after);
 }
 return out;
}
export function webGL2Language(source){
 return '#version 300 es\n'+source.replace(/varying vec2 /g,'in vec2 ').replace(/texture2D\(/g,'texture(').replace(/gl_FragColor/g,'fragmentOutput').replace('void main()', 'out vec4 fragmentOutput;\nvoid main()');
}
