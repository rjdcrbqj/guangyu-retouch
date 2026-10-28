'use strict';

// 原857B scalar的显式packed供给式适配；301/401为产品物理布局标签。
function applySuppliedReferenceColorMap({source,width,height,stride,channels,begin=0,end=height,lut,lutSize,lutFormat,lutStride,coordinates,axis0,axis1,axis2,rounding}={}){
 if(!(source instanceof Uint8Array)||!(lut instanceof Uint8Array)||![3,4].includes(channels)||
  !Number.isSafeInteger(width)||width<0||width>32766||!Number.isSafeInteger(height)||height<1||height>32766||width*height>80_000_000||
  !Number.isSafeInteger(stride)||stride<width*channels||stride>0x7fffffff||!Number.isSafeInteger(stride*height)||source.length<stride*height||
  !Number.isSafeInteger(begin)||!Number.isSafeInteger(end)||begin<0||end<begin||end>height||rounding!=='integer-sar7-sar14')throw TypeError('参考颜色映射需要完整BYTE源、合法行范围和显式整数舍入');
 if(![64,512].includes(lutSize)||![301,401].includes(lutFormat))throw TypeError('参考颜色映射仅支持明确packed64/512 LUT301/401');
 const C=lutFormat===301?3:4,n=lutSize===64?16:64,tiles=lutSize===64?4:8,step=lutSize*C;
 if(lutStride!==step||lut.length<lutSize*step||!(coordinates instanceof Int32Array)||coordinates.length!==256||
  ![axis0,axis1,axis2].every(a=>a instanceof Int32Array&&a.length===n+1))throw TypeError('参考颜色LUT或原INT表布局不完整');
 for(let v=0;v<256;v++)if(coordinates[v]!== (lutSize===64?Math.floor(1920*v/255):Math.max(32*v-1,0)))throw RangeError('参考颜色LUT坐标表不匹配');
 for(let i=0;i<=n;i++){
  const j=Math.min(i,n-1);
  if(axis0[i]!==j*C||axis1[i]!==j*step||axis2[i]!==Math.floor(j/tiles)*n*step+(j%tiles)*n*C)throw RangeError('参考颜色LUT offset表不匹配packed布局');
 }
 const output=new Uint8Array(source);
 for(let y=begin;y<end;y++)for(let x=0;x<width;x++){
  const p=y*stride+x*channels,q0=coordinates[source[p]],q1=coordinates[source[p+1]],q2=coordinates[source[p+2]],
   f0=q0&127,f1=q1&127,f2=q2&127,i0=q0>>7,i1=q1>>7,i2=q2>>7;
  const x0=axis0[i0],x1=axis0[i0+1],y0=axis1[i1],y1=axis1[i1+1],z0=axis2[i2],z1=axis2[i2+1];
  for(let ch=0;ch<3;ch++){
   const v000=lut[x0+y0+z0+ch],v100=lut[x1+y0+z0+ch],v010=lut[x0+y1+z0+ch],v110=lut[x1+y1+z0+ch],
    v001=lut[x0+y0+z1+ch],v101=lut[x1+y0+z1+ch],v011=lut[x0+y1+z1+ch],v111=lut[x1+y1+z1+ch];
   const a0=v000*128+(v100-v000)*f0,a1=v001*128+(v101-v001)*f0,
    b0=a0+(((v010*128-a0+(v110-v010)*f0)*f1+64)>>7),
    b1=a1+(((v011*128-a1+(v111-v011)*f0)*f1+64)>>7),
    value=(((b1-b0)*f2+128)>>14)+((b0+64)>>7);
   output[p+ch]=Math.max(0,Math.min(255,value));
  }
 }
 return output;
}
module.exports={applySuppliedReferenceColorMap};
