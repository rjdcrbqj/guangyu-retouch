const f=Math.fround;
function corners(scale,cx,cy){scale=f(scale);cx=f(cx);cy=f(cy);if(!Number.isFinite(scale)||scale<=0||![cx,cy].every(Number.isFinite))throw Error('finite supplied scale/center');const inv=f(1/scale),offset=f(f(0*inv)+f(-256*inv)),x=f(cx+offset),y=f(offset+cy),size=f(inv*435.2),right=f(x+size),bottom=f(size+y);return new Float32Array([x,y,right,y,x,bottom,right,bottom]);}
function clip(rect,width,height){if(rect.length!==4||![...rect,width,height].every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647))throw Error('supplied INT32');const x=Math.max(rect[0],0),y=Math.max(rect[1],0);return new Int32Array([x,y,Math.min((width-x)|0,rect[2]),Math.min((height-y)|0,rect[3])]);}
module.exports={corners,clip};
