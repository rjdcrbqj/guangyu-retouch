// 查看倍率以物理显示像素为基准，独立于1600像素的工作蒙版网格。
export function viewLayout({width,height,zoom,pixelRatio=1,viewportWidth,viewportHeight}){
 const ratio=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
 const scale=zoom==='fit'?Math.max(1/Math.max(width,height),Math.min(Math.max(1,viewportWidth-56)/width,Math.max(1,viewportHeight-56)/height,1/ratio)):Number(zoom)/100/ratio;
 return {width:width*scale,height:height*scale,scale,detail:zoom!=='fit'&&Math.max(width,height)>1600&&Math.max(width,height)*Math.min(1,Number(zoom)/100)>1600};
}
