const dataImage=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;
const maxDataURL=80*1024*1024+128;

// 保存嵌入图像及明确单参考图区域；解码后仍须核对真实宽高。
export function normalizeReferenceState(value){
 if(value===undefined||value===null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw new Error('参考图状态无效');
 const {image,width,height}=value,mode=value.mode??'single',revision=value.revision??0;
 if(mode!=='single'||!Number.isSafeInteger(revision)||revision<0)throw new Error('参考图模式或修订号无效');
 if(image===null){
  if(width!==0||height!==0||(value.rect!==undefined&&value.rect!==null))throw new Error('清除的参考图状态无效');
  return {mode,image:null,width:0,height:0,rect:null,pickPoint:null,revision};
 }
 if(typeof image!=='string'||image.length>maxDataURL||!dataImage.test(image)||
  ![width,height].every(n=>Number.isInteger(n)&&n>=2&&n<=32766)||width*height>80000000)throw new Error('参考图内容或尺寸无效');
 const pickPoint=value.pickPoint??null;
 if(pickPoint!==null&&(!Array.isArray(pickPoint)||pickPoint.length!==2||!pickPoint.every(n=>Number.isInteger(n)&&n>=0)))throw new Error('参考取点无效');
 const rect=value.rect??null;
 if(rect!==null&&(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isInteger)||
  rect[0]<0||rect[1]<0||rect[2]<1||rect[3]<1||rect[0]+rect[2]>width||rect[1]+rect[3]>height))throw new Error('参考图区域超出图像或已损坏');
 return {mode,image,width,height,rect:rect?.slice()??null,pickPoint:pickPoint?.slice()??null,revision};
}

// 修订号使之后的处理作业可以检测参考图替换，溢出时不产生重复身份。
function nextRevision(state){
 const revision=normalizeReferenceState(state)?.revision??0;
 if(revision===Number.MAX_SAFE_INTEGER)throw new Error('参考图修订号已达到上限');
 return revision+1;
}
export function replaceReference(state,image){
 if(!image||typeof image!=='object'||image.image===null)throw new Error('请选择有效参考图');
 return normalizeReferenceState({...image,mode:'single',revision:nextRevision(state)});
}
export function clearReference(state){return {mode:'single',image:null,width:0,height:0,rect:null,pickPoint:null,revision:nextRevision(state)};}

// 作业仅持有独立冻结副本，界面之后的修改不会改变已提交数据。
export function snapshotReference(state){
 const copy=normalizeReferenceState(state);if(copy===null)return null;
 if(copy.rect)Object.freeze(copy.rect);return Object.freeze(copy);
}
