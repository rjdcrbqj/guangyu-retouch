// 工作分辨率RGBA按需读取：不再为每张照片长期驻留一份（1600×1067 约6.5MB，
// 100张就会累积约0.64GB）。取色与作业各读一次，用完即弃。
export function makeWorkingPixelsReader(doc){
 return function read(img){
  const w=img.naturalWidth,h=img.naturalHeight;
  const ratio=Math.min(1,1600/Math.max(w,h));
  const cw=Math.max(1,Math.round(w*ratio)),ch=Math.max(1,Math.round(h*ratio));
  const c=doc.createElement('canvas');c.width=cw;c.height=ch;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,0,0,cw,ch);
  return {data:new Uint8Array(ctx.getImageData(0,0,cw,ch).data),width:cw,height:ch};
 };
}
