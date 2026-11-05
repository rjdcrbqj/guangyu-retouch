// 浏览手势单独拦截，不切换原工具、不修改照片和撤销历史。
export function installViewPan({document,window,viewport,canPan,isHand,spaceAssigned=()=>false,onStart=()=>{}}){
 let space=false,drag=null;
 const editable=target=>target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName);
 function end(){const old=drag;drag=null;viewport.classList.remove('view-dragging');if(old&&viewport.hasPointerCapture?.(old.id))viewport.releasePointerCapture(old.id);}
 function reset(){space=false;viewport.classList.remove('view-space');end();}
 document.addEventListener('keydown',e=>{if(e.code!=='Space'||e.isComposing||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||editable(e.target)||spaceAssigned()||!canPan())return;space=true;e.preventDefault();e.stopImmediatePropagation();viewport.classList.add('view-space');},true);
 document.addEventListener('keyup',e=>{if(e.code==='Space'&&space){e.preventDefault();reset();}},true);
 window.addEventListener('blur',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 viewport.addEventListener('pointerdown',e=>{
  if(drag||!canPan()||editable(e.target)||!(e.button===1||e.button===0&&(space||isHand())))return;
  e.preventDefault();e.stopImmediatePropagation();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);viewport.classList.add('view-dragging');onStart();
 },true);
 viewport.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();if(!canPan()){reset();return;}viewport.scrollLeft=drag.left+drag.x-e.clientX;viewport.scrollTop=drag.top+drag.y-e.clientY;},true);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(name,e=>{if(drag?.id===e.pointerId){e.preventDefault();e.stopImmediatePropagation();end();}},true);
 viewport.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
 return {reset,isDragging:()=>!!drag};
}
