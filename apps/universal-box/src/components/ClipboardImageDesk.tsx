import {useEffect,useState,type ChangeEvent,type ClipboardEvent as ReactClipboardEvent} from "react";
import {exportFile} from "../lib/output";
import {imageBlobToPng,validatePastedImage} from "../lib/clipboardImage";

const msg=(err:unknown)=>err instanceof Error?err.message:String(err);
type ConvertedImage={bytes:Uint8Array;width:number;height:number};
export default function ClipboardImageDesk(){
 const [picture,setPicture]=useState<ConvertedImage|null>(null);
 const [previewUrl,setPreviewUrl]=useState("");
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 useEffect(()=>{
  if(!picture){setPreviewUrl("");return;}
  const url=URL.createObjectURL(new Blob([new Uint8Array(picture.bytes)],{type:"image/png"}));
  setPreviewUrl(url);
  return ()=>URL.revokeObjectURL(url);
 },[picture]);

 async function acceptImage(source:Blob){
  if(busy)return;
  try{validatePastedImage(source);}
  catch(err){setStatus("图片未被接收，之前的预览保留："+msg(err));return;}
  setBusy(true);setStatus("");
  try{
   const converted=await imageBlobToPng(source);
   setPicture(converted);
   setStatus("已在本机生成真实 PNG · "+converted.width+"×"+converted.height+
    " px · "+converted.bytes.length.toLocaleString()+" bytes；可先预览再另存。");
  }catch(err){setStatus("转换失败，之前的预览保留："+msg(err));}
  finally{setBusy(false);}
 }
 function paste(event:ReactClipboardEvent<HTMLDivElement>){
  if(busy){event.preventDefault();return;}
  const images=Array.from(event.clipboardData.items).filter(item=>item.kind==="file"&&
   item.type.toLowerCase().startsWith("image/"));
  if(!images.length){setStatus("剪贴板里没有可用图片。先复制图片或截图，然后点此区域按 ⌘V。");return;}
  event.preventDefault();
  if(images.length!==1){setStatus("一次只能粘贴一张图片；之前的预览保留。");return;}
  const file=images[0].getAsFile();
  if(!file){setStatus("无法从剪贴板读取图片；可使用下方本地图片选择器。");return;}
  void acceptImage(file);
 }
 function fileChange(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.target.files??[]);
  event.target.value="";
  if(files.length!==1){if(files.length)setStatus("一次只能选择一张图片。");return;}
  void acceptImage(files[0]);
 }
 async function savePng(){
  if(!picture||busy)return;
  setBusy(true);setStatus("");
  try{
   const saved=await exportFile("clipboard-image.png",picture.bytes);
   setStatus(saved?"真实 PNG 已保存为新文件，剪贴板及来源图片未改变。":"保存已取消，转换预览仍在。");
  }catch(err){setStatus("保存失败，PNG 预览仍在："+msg(err));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="clipboard-image-desk">
  <p className="eyebrow">SENTINEL BOX · OFFLINE DAILY IMAGE TOOLS</p>
  <h2>剪贴板图片 → PNG · Paste Image to File</h2>
  <p className="subtle">适合把聊天图片、屏幕截图或网页复制的图片保存为真正的 PNG 文件。需要手动粘贴；不会监听、扫描或保存剪贴板历史。</p>
  <div className="panel" data-testid="clipboard-image-paste-zone" tabIndex={0} role="textbox"
   aria-label="点击此区域后粘贴剪贴板图片" aria-multiline="false" onPaste={paste}
   onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.currentTarget.focus();}}}>
   <p><strong>点击这里，然后按 ⌘V 粘贴图片</strong>（Windows/Linux 使用 Ctrl+V）</p>
   <p className="subtle">PNG / JPEG / WebP · ≤12MB · ≤1,200 万像素。粘贴后只在本机解码、转成 PNG；不上传。</p>
  </div>
  <label className="field-label">剪贴板访问失败？也可直接选择本地图片
   <input data-testid="clipboard-image-file" className="field" type="file" disabled={busy}
    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={fileChange}/>
  </label>
  {picture&&<>
   <div className="metrics" data-testid="clipboard-image-stats">
    <span>真实 PNG</span><span>{picture.width} × {picture.height} px</span>
    <span>{picture.bytes.length.toLocaleString()} bytes</span>
   </div>
   {previewUrl&&<img data-testid="clipboard-image-preview" src={previewUrl}
    alt="用户明确粘贴或选择的图片转换为 PNG 后的本地预览"
    style={{maxWidth:"100%",maxHeight:440,objectFit:"contain",display:"block",marginTop:12}}/>}
   <div className="actions">
    <button className="primary-button" data-testid="clipboard-image-save"
     disabled={busy} onClick={()=>void savePng()}>保存 PNG 文件</button>
    <button type="button" className="secondary-button" data-testid="clipboard-image-clear"
     disabled={busy} onClick={()=>{setPicture(null);setStatus("已清空此页面的 PNG 预览；原始图片和剪贴板不变。");}}>清空预览</button>
   </div>
  </>}
  {status&&<p role="status" data-testid="clipboard-image-status" className="subtle">{status}</p>}
 </section>;
}
