// 所有查看方式共用相同的缩放档位，不改变照片像素。
export const ZOOM_STEPS=Object.freeze([5,10,12.5,25,33,50,67,75,100,125,150,200,300,400]);
export function nextZoomPercent(percent,direction){
 return direction==='in'?(ZOOM_STEPS.find(value=>value>percent+0.01)??400):([...ZOOM_STEPS].reverse().find(value=>value<percent-0.01)??5);
}

// 将缩放后鼠标所指的图像位置移回原位置；边界由滚动容器钳位。
export function anchorScrollDelta(before,after,pointer){
 const x=Math.max(0,Math.min(1,(pointer.x-before.left)/before.width));
 const y=Math.max(0,Math.min(1,(pointer.y-before.top)/before.height));
 return {x:after.left+x*after.width-pointer.x,y:after.top+y*after.height-pointer.y};
}
