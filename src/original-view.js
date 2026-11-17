import {PhotoEngine} from './engine.js';

// 精细查看只增加显示层；蒙版、历史、工程和导出仍由原工作台持有。
export class OriginalView{
 constructor({preview,overlay,wrap,viewport}){
  Object.assign(this,{preview,overlay,wrap,viewport});this.generation=0;
  this.canvas=document.createElement('canvas');this.canvas.id='original-detail';this.canvas.hidden=true;this.canvas.setAttribute('aria-hidden','true');wrap.append(this.canvas);
  this.onScroll=()=>this.refresh();viewport.addEventListener('scroll',this.onScroll,{passive:true});
 }
 configure(layout,image){
  if(this.image!==image||!layout.detail)this.release();
  this.image=image;this.layout=layout;
 }
 // 与原尺寸导出使用完全相同的引擎和全图坐标，平移仅复制可见像素。
 async render(frame){
  if(!this.layout?.detail)return false;
  this.latestFrame=frame;
  if(this.engine){try{this.paint(frame);return true;}catch(error){this.release();throw error;}}
  if(this.initializing)return this.initializing;
  const generation=this.generation,surface=document.createElement('canvas'),candidate=new PhotoEngine(surface);this.candidate=candidate;
  const pending=this.initialize(candidate,surface,frame,generation);this.initializing=pending;
  try{return await pending;}finally{if(this.initializing===pending)this.initializing=null;}
 }
 // 准备期间保留快速预览；切图或缩回时，迟到的任务不能覆盖当前照片。
 async initialize(candidate,surface,frame,generation){
  try{
   await candidate.prepareImage(frame.image);
   if(frame.comparison!==frame.image)await candidate.prepareImage(frame.comparison);
   if(this.generation!==generation)return false;
   candidate.setImage(frame.image,{maxSize:Infinity,comparison:frame.comparison});
   this.engine=candidate;this.surface=surface;this.candidate=null;this.revision=null;this.paint(this.latestFrame);return true;
  }catch(error){if(this.generation!==generation)return false;this.release();throw error;}
  finally{if(this.engine!==candidate)candidate.dispose();}
 }
 paint(frame){
  if(this.revision!==frame.revision){this.engine.setMasks(frame.skin,frame.teeth,frame.ai,frame.nativeTeethFaces);this.revision=frame.revision;}
  this.engine.setBrightEyeFaces(frame.brightEyeFaces);this.engine.render(frame.params,frame.split,frame.perspective,frame.liquify);this.ready=true;this.draw();
 }
 refresh(){if(!this.pending)this.pending=requestAnimationFrame(()=>{this.pending=0;this.draw();});}
 draw(){
  if(!this.ready||!this.layout?.detail)return;
  const image=this.image,r=this.wrap.getBoundingClientRect(),v=this.viewport.getBoundingClientRect(),scale=this.layout.scale;
  const left=Math.max(r.left,v.left+this.viewport.clientLeft),top=Math.max(r.top,v.top+this.viewport.clientTop);
  const right=Math.min(r.right,v.left+this.viewport.clientLeft+this.viewport.clientWidth),bottom=Math.min(r.bottom,v.top+this.viewport.clientTop+this.viewport.clientHeight);
  if(right<=left||bottom<=top){this.canvas.hidden=true;return;}
  const x=Math.max(0,Math.floor((left-r.left)/scale)),y=Math.max(0,Math.floor((top-r.top)/scale));
  const width=Math.min(image.naturalWidth-x,Math.ceil((right-r.left)/scale)-x),height=Math.min(image.naturalHeight-y,Math.ceil((bottom-r.top)/scale)-y);
  if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;
  const context=this.canvas.getContext('2d');context.clearRect(0,0,width,height);context.imageSmoothingEnabled=false;this.engine.drawRegion(context,{x,y,width,height});
  Object.assign(this.canvas.style,{left:x*scale+'px',top:y*scale+'px',width:width*scale+'px',height:height*scale+'px',imageRendering:scale*devicePixelRatio>=1?'pixelated':'auto'});
  this.canvas.dataset.sourceX=String(x);this.canvas.dataset.sourceY=String(y);this.canvas.hidden=false;this.preview.style.visibility='hidden';
 }
 // 缩回快速预览或切换照片时释放原尺寸显存，避免隐藏上下文累积。
 release(){
  if(this.pending){cancelAnimationFrame(this.pending);this.pending=0;}
  this.generation++;this.candidate?.dispose();this.candidate=null;this.initializing=null;this.latestFrame=null;
  this.engine?.dispose();this.engine=null;this.surface=null;this.ready=false;this.revision=null;this.canvas.hidden=true;this.canvas.width=this.canvas.height=1;this.preview.style.visibility='';
 }
 dispose(){this.release();this.viewport.removeEventListener('scroll',this.onScroll);this.canvas.remove();}
}
