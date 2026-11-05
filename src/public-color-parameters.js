// 保留历史工程的字段与范围，运行时无需恢复的查找表。
export const nativeColorSpecs=Object.freeze([
 ...[['hslEnabled','启用 HSL'],['tempTintEnabled','启用色温与色调']].map(([key,label])=>({key,label,min:0,max:1,step:1,default:0,group:'basic'})),
 ...['Hue','Saturation','Luma'].flatMap((type,t)=>['红','橙','黄','绿','青','蓝','紫','洋红'].map((name,i)=>({key:`hsl${type}${i}`,label:name+' · '+['色相','饱和度','明度'][t],min:-100,max:100,step:1,default:0,group:'basic'}))),
 ...[['relativeTemperature','相对色温'],['relativeTint','相对色调']].map(([key,label])=>({key,label,min:-100,max:100,step:1,default:0,group:'basic'}))
]);
