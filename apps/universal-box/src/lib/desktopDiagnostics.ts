import {isTauri} from "@tauri-apps/api/core";

export type CheckLevel="ok"|"attention"|"info";
export type DiagnosticCheck={id:string;title:string;level:CheckLevel;detail:string};
export type DiagnosticSummary={ok:number;attention:number;info:number};
export function summarizeDiagnostics(checks:DiagnosticCheck[]):DiagnosticSummary{
 return checks.reduce((counts,check)=>({...counts,[check.level]:counts[check.level]+1}),{ok:0,attention:0,info:0});
}
export function diagnosticExport(checks:DiagnosticCheck[]):string{
 // Deliberately exclude usernames, local paths, system model, installed apps and private files.
 return JSON.stringify({product:"Universal Box",version:"0.31.0",report:"Local capability self-check",
  checks:checks.map(({id,title,level,detail})=>({id,title,level,detail}))},null,2)+"\n";
}
export async function runLocalDiagnostics():Promise<DiagnosticCheck[]>{
 const checks:DiagnosticCheck[]=[];
 const add=(id:string,title:string,level:CheckLevel,detail:string)=>checks.push({id,title,level,detail});
 add("shell","macOS 桌面外壳",isTauri()?"ok":"info",
  isTauri()?"检测到 Tauri 桌面运行环境。":"当前是网页预览环境；原生桌面功能需要使用 DMG 安装版。");
 try{
  if(!globalThis.crypto?.subtle)throw Error("Unavailable");
  const bytes=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode("abc"));
  const hash=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
  if(hash!=="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")throw Error("SHA mismatch");
  add("sha256","本机 SHA-256 校验","ok","已完成标准测试向量验证；可用于文件工作台的哈希计算。");
 }catch{
  add("sha256","本机 SHA-256 校验","attention","SHA-256 不可用或自检失败；文件完整性功能可能无法运行。");
 }
 try{
  const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;
  const context=canvas.getContext("2d");
  if(!context)throw Error("No 2D context");
  context.fillStyle="#fff";context.fillRect(0,0,1,1);
  add("canvas","图片工具渲染能力","ok","Canvas 2D 可用。仍需用真实图片进行格式转换验收。");
 }catch{
  add("canvas","图片工具渲染能力","attention","Canvas 2D 不可用；图像工具可能无法绘制。");
 }
 try{
  const key="__universal_box_diagnostics_probe__";
  // Do not touch existing settings; if another probe key already exists, preserve it.
  const previous=localStorage.getItem(key);
  try{localStorage.setItem(key,"test");if(localStorage.getItem(key)!=="test")throw Error("Storage unavailable");}
  finally{if(previous===null)localStorage.removeItem(key);else localStorage.setItem(key,previous);}
  add("storage","偏好设置本地存储","ok","临时写入、读取和恢复成功；未更改现有工作空间数据。");
 }catch{
  add("storage","偏好设置本地存储","attention","本机偏好存储不可写；主题、收藏等设置可能无法保存。");
 }
 add("downloads","本机文件导出接口",
  typeof Blob!=="undefined"&&typeof URL.createObjectURL==="function"?"ok":"attention",
  typeof Blob!=="undefined"&&typeof URL.createObjectURL==="function"
   ?"已检测到 Blob 导出接口；macOS 保存对话框仍需人工测试。":"当前环境没有可用的浏览器文件导出接口。");
 add("clipboard","系统剪贴板",typeof navigator!=="undefined"&&!!navigator.clipboard?"info":"attention",
  typeof navigator!=="undefined"&&!!navigator.clipboard?"剪贴板 API 存在，是否允许写入取决于系统授权。":"剪贴板 API 不可用；请使用导出文件代替。");
 return checks;
}
