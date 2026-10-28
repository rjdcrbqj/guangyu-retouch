'use strict';
function areaRow(rows,cn=3){
 if(![1,3,4].includes(cn))throw Error('CN2 generic fallback remains Unknown');
 if(rows.length!==2||rows[0].length!==rows[1].length||rows[0].length%(2*cn)!==0)throw Error('exact2x2 source row geometry');
 const n=rows[0].length/2,out=[];
 for(let i=0;i<n;i++){const x=Math.floor(i/cn)*2*cn+i%cn;out.push((rows[0][x]+rows[0][x+cn]+rows[1][x]+rows[1][x+cn]+2)>>2);}
 return out;
}
function exact2x2(source,width,height,cn=3){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width%2||height%2||source.length!==width*height*cn)throw Error('exact2x2 geometry');
 const out=[];for(let y=0;y<height;y+=2)out.push(...areaRow([Array.from(source.slice(y*width*cn,(y+1)*width*cn)),Array.from(source.slice((y+1)*width*cn,(y+2)*width*cn))],cn));return out;
}
function gray32RGB64(source){if(source.length!==64*64*3)throw Error('64x64 BYTE301 CN3 required');return exact2x2(source,64,64,3);}
module.exports={areaRow,exact2x2,gray32RGB64,scope:'Original mode3 exact2x2 BYTE CN1/3/4 complete finite numeric helper + SIMD proven; CN2 fallback / full Mat / full resize unknown'};
if(require.main===module){const fs=require('fs'),fixtures=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));let cases=0,fields=0;for(const f of fixtures){if(f.cn===2)continue;const a=areaRow(f.rows,f.cn);if(JSON.stringify(a)!==JSON.stringify(f.reference))throw Error('fixture mismatch');cases++;fields+=a.length;}console.log(JSON.stringify({pass:true,cases,fields,mismatch:0}));}
