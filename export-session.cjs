const fs=require('node:fs/promises');const path=require('node:path');const {randomUUID}=require('node:crypto');

// 主进程保管目录；界面只能向已建立的会话写入单个图片文件名。
class ExportSessions{
 constructor(){this.sessions=new Map();}
 async begin(parent){const directory=await fs.mkdtemp(path.join(parent,'光屿导出-'));const id=randomUUID();this.sessions.set(id,directory);return {id,directory};}
 async write(id,name,data){
  const directory=this.sessions.get(id);if(!directory)throw new Error('导出会话已结束');
  if(typeof name!=='string'||name.length>240||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)||!/^.+\.(png|jpg)$/i.test(name))throw new Error('导出文件名无效');
  if(!(data instanceof Uint8Array)||!data.byteLength||data.byteLength>300*1024*1024)throw new Error('导出图片数据无效');
  const filename=path.join(directory,name);let handle;
  try{handle=await fs.open(filename,'wx');await handle.writeFile(data);}catch(error){if(handle){await handle.close();handle=null;await fs.unlink(filename).catch(()=>{});}throw error;}finally{if(handle)await handle.close();}
  return {name,bytes:data.byteLength};
 }
 async finish(id){const directory=this.sessions.get(id);if(!directory)throw new Error('导出会话已结束');this.sessions.delete(id);return directory;}
}
module.exports={ExportSessions};
