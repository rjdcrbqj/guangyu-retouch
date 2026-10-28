// 工程重开后恢复参考取色的通道供给。
// 已保存的64×64参考图是 dataURL；通道需要的是编码PNG的BYTE加显式policy。
// 参考蒙版裁切块无法从64×64参考图反推，因此本模块**不制造**它：
// 调用方必须重新取色（或未来把裁切块一并持久化）才能再次应用。
const POLICY='encoded-opaque-rgba8-reference64-no-metadata-transform';
const DATA_URL=/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/;

function base64ToBytes(b64){
 const bin=atob(b64.replace(/\s+/g,''));
 const out=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 return out;
}

// 返回 {referencePNGSupply} 或 null（参考已清除）；不返回任何掩版字段。
function restoreReferenceSupplies(state){
 if(state===null||state===undefined)return null;
 if(typeof state!=='object')throw TypeError('参考状态无效');
 const image=state.image;
 if(image===null)return null;
 if(image===undefined)throw TypeError('参考状态缺少image字段');
 if(typeof image!=='string')throw TypeError('参考状态image必须是dataURL字符串');
 const m=DATA_URL.exec(image);
 if(!m)throw TypeError('参考图不是有效PNG dataURL，无法恢复为可应用的参考');
 const data=base64ToBytes(m[1]);
 if(data.length<8||data[0]!==137||data[1]!==80||data[2]!==78||data[3]!==71)
  throw TypeError('参考图不是有效PNG，无法恢复为可应用的参考');
 return {referencePNGSupply:{data,policy:POLICY}};
}

export {restoreReferenceSupplies};
