// 规范64×64 RGBA8 PNG编码器：只产出 IHDR/IDAT/IEND，无metadata、无交错。
// 目的：不依赖浏览器canvas的chunk布局（canvas可能插入其它chunk或使用非规范filter），
// 使参考图能通过产品自身 straw-png 的严格解码器。
// 使用 filter0（None）逐行，保证解码端逐字节可预测。
const SIDE=64,SIG=[137,80,78,71,13,10,26,10];

const CRC_TABLE=(()=>{const t=new Uint32Array(256);
 for(let v=0;v<256;v++){let c=v;for(let b=0;b<8;b++)c=(c>>>1)^((c&1)?0xedb88320:0);t[v]=c>>>0;}return t;})();
function crc32(bytes){
 let c=0xffffffff;
 for(let i=0;i<bytes.length;i++)c=(c>>>8)^CRC_TABLE[(c^bytes[i])&255];
 return (c^0xffffffff)>>>0;
}
function chunk(type,data){
 const out=new Uint8Array(12+data.length),view=new DataView(out.buffer);
 view.setUint32(0,data.length);
 for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);
 out.set(data,8);
 view.setUint32(8+data.length,crc32(out.subarray(4,8+data.length)));
 return out;
}

// 输入必须是64×64×4的RGBA且alpha全255（与解码端合同一致）。
async function encodeReferencePNG64(rgba){
 if(!(rgba instanceof Uint8Array))throw TypeError('参考PNG编码需要BYTE像素');
 if(rgba.length!==SIDE*SIDE*4)throw TypeError('参考PNG编码需要64×64×4的RGBA像素');
 for(let i=0;i<SIDE*SIDE;i++)
  if(rgba[i*4+3]!==255)throw RangeError('参考PNG只接受全不透明alpha255');
 // 每行前置filter字节0；原始数据 64*(1+256) = 64*257 字节。
 const raw=new Uint8Array(SIDE*257);
 for(let y=0;y<SIDE;y++){
  raw[y*257]=0;
  raw.set(rgba.subarray(y*SIDE*4,(y+1)*SIDE*4),y*257+1);
 }
 const compressed=await zlibDeflate(raw);
 const ihdr=new Uint8Array(13),v=new DataView(ihdr.buffer);
 v.setUint32(0,SIDE);v.setUint32(4,SIDE);ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 const parts=[new Uint8Array(SIG),chunk('IHDR',ihdr),chunk('IDAT',compressed),chunk('IEND',new Uint8Array(0))];
 const total=parts.reduce((a,p)=>a+p.length,0),out=new Uint8Array(total);
 let off=0;for(const p of parts){out.set(p,off);off+=p.length;}
 return out;
}

// 用标准 CompressionStream('deflate')：Electron渲染进程与Node18+均可用，返回zlib包装流。
async function zlibDeflate(bytes){
 if(typeof CompressionStream!=='function')throw new Error('参考PNG编码需要可用的deflate实现');
 const cs=new CompressionStream('deflate'),writer=cs.writable.getWriter();
 writer.write(bytes);writer.close();
 const buf=await new Response(cs.readable).arrayBuffer();
 return new Uint8Array(buf);
}

export {encodeReferencePNG64};
