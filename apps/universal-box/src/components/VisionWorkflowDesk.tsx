import {useMemo,useState,type ChangeEvent} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {exportFile} from "../lib/output";
import {normalizeOcrLines} from "../lib/ocrTextFlow";
import {markdownToDocx} from "../lib/documentExport";
import {buildProjectPack,planProjectPack,type ProjectPackInput} from "../lib/projectWorkflow";

export type VisionWorkflowMode="ocr"|"capture"|"project";
type RecognizedLine={text:string;confidence:number};
const toError=(e:unknown)=>e instanceof Error?e.message:String(e);
function filenameBase(name:string){return name.replace(/\.[^.]+$/u,"").replace(/[^\p{L}\p{N}._-]/gu,"-").slice(0,50)||"image";}
function pngFromCanvas(canvas:HTMLCanvasElement):Promise<File>{
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>
  blob?resolve(new File([blob],"universal-box-capture.png",{type:"image/png"})):reject(Error("Cannot encode selected screen frame.")),"image/png"));
}
const initialProject:ProjectPackInput={
 title:"Creative Project",subtitle:"A complete starting kit made offline",
 outline:"## Problem and users\n- Whom are we helping?\n- What is hard today?\n\n## Approach\n- Sketch a solution\n- Build a small prototype\n\n## Verification\n- Test with real tasks\n- Collect and act on feedback",
 notes:"Describe your evidence, measurements and design choices here.",theme:"ocean",
};
export default function VisionWorkflowDesk({initialMode="ocr"}:{initialMode?:VisionWorkflowMode}){
 const [mode,setMode]=useState<VisionWorkflowMode>(initialMode),[file,setFile]=useState<File|null>(null),
  [status,setStatus]=useState(""),[busy,setBusy]=useState(false),[fast,setFast]=useState(false);
 const [result,setResult]=useState<RecognizedLine[]|null>(null);
 const [edited,setEdited]=useState("");
 const [project,setProject]=useState<ProjectPackInput>(initialProject);
 const planned=useMemo(()=>{try{return {plan:planProjectPack(project),error:""};}catch(e){
  return {plan:null,error:toError(e)};
 }},[project]);
 function selectFile(event:ChangeEvent<HTMLInputElement>){
  const selected=event.target.files?.[0]??null;event.target.value="";
  setFile(selected);setStatus("");setResult(null);setEdited("");
 }
 async function recognizePhoto(photo:File,copyAfter:boolean){
   if(!isTauri())throw Error("Native Apple Vision OCR is available only in the macOS desktop app.");
   if(!/^(image\/png|image\/jpeg|image\/webp)$/u.test(photo.type))throw Error("Choose a PNG, JPEG or WebP image.");
   if(photo.size<1||photo.size>8_000_000)throw Error("OCR image must be 1 byte to 8 MB.");
   const bytes=new Uint8Array(await photo.arrayBuffer());
   const native=await invoke<unknown>("recognize_image_text",{bytes:Array.from(bytes),fast});
   const verified=normalizeOcrLines(native);
   setResult(verified.lines);setEdited(verified.text);
   if(!verified.text.trim()){setStatus("Apple Vision found no text. The screenshot remains available.");return;}
   if(copyAfter){
    try{
     if(!navigator.clipboard?.writeText)throw Error("Clipboard write API is unavailable.");
     await navigator.clipboard.writeText(verified.text);
     setStatus("Recognized "+verified.lines.length+" OCR lines locally and copied the text. Verify accuracy before use.");
    }catch{
     setStatus("Recognized "+verified.lines.length+" OCR lines locally. Clipboard permission was unavailable: use the Copy OCR Text button.");
    }
   }else setStatus("Recognized "+verified.lines.length+" lines locally. Review and copy or save the editable text.");
 }
 async function recognize(){
  if(!file||busy)return;setBusy(true);setStatus("");
  try{await recognizePhoto(file,false);}
  catch(e){setStatus("OCR failed: "+toError(e));}
  finally{setBusy(false);}
 }
 async function screenShot():Promise<File|null>{
  setStatus("");setBusy(true);
  let stream:MediaStream|null=null;
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw Error("Screen picker is not supported by this browser/WebView; try the desktop system screenshot shortcut and import the PNG.");
   // Request only on explicit button click; the user selects the screen/window via the system picker.
   stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
   const video=document.createElement("video");
   video.srcObject=stream;video.muted=true;video.playsInline=true;
   await new Promise<void>((resolve,reject)=>{
    const timeout=window.setTimeout(()=>reject(Error("No readable screen frame received.")),10000);
    video.onloadeddata=()=>{window.clearTimeout(timeout);resolve();};
    video.onerror=()=>{window.clearTimeout(timeout);reject(Error("Screen capture playback is unavailable."));};
    video.play().catch(error=>{window.clearTimeout(timeout);reject(error);});
   });
   const width=video.videoWidth,height=video.videoHeight;
   if(width<1||height<1)throw Error("Screen capture did not return valid pixels.");
   const scale=Math.min(1,2400/width,2400/height);
   const canvas=document.createElement("canvas");
   canvas.width=Math.max(1,Math.round(width*scale));
   canvas.height=Math.max(1,Math.round(height*scale));
   const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas API unavailable.");
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   const photo=await pngFromCanvas(canvas);
   if(photo.size>8_000_000)throw Error("Screenshot exceeds 8 MB; use the system screenshot tool.");
   setFile(photo);setResult(null);setEdited("");
   setStatus("Captured one selected screen frame with your permission. All screen tracks stopped; choose OCR or save.");
   return photo;
  }catch(e){setStatus("Screen selection failed: "+toError(e));return null;}
  finally{stream?.getTracks().forEach(t=>t.stop());setBusy(false);}
 }
 async function captureRecognizeCopy(){
  if(busy)return;
  if(!isTauri()){setStatus("One-click screenshot OCR requires Apple Vision in the macOS desktop app. In a browser, take a screenshot and use the macOS app to recognize it.");return;}
  const captured=await screenShot();if(!captured)return;
  setBusy(true);
  try{await recognizePhoto(captured,true);}catch(e){setStatus("Screenshot saved in this session, but OCR could not finish: "+toError(e));}
  finally{setBusy(false);}
 }
 async function copyOcrText(){
  if(!edited.trim())return;
  try{
   if(!navigator.clipboard?.writeText)throw Error("Clipboard permission unavailable.");
   await navigator.clipboard.writeText(edited);setStatus("Copied manually reviewed OCR text to clipboard.");
  }catch{setStatus("Clipboard unavailable. Select the OCR text above and copy with ⌘C.");}
 }
 async function saveScreenshot(){
  if(!file)return;
  setBusy(true);setStatus("");
  try{
   const bytes=new Uint8Array(await file.arrayBuffer());
   const ok=await exportFile(filenameBase(file.name)+".png",bytes);
   setStatus(ok?"Saved a user-selected screenshot PNG.":"Save cancelled.");
  }catch(e){setStatus("Save failed: "+toError(e));}
  finally{setBusy(false);}
 }
 async function saveOcr(format:"txt"|"docx"){
  setBusy(true);setStatus("");
  try{
   if(!edited.trim())throw Error("There is no OCR text to export.");
   if(edited.length>200_000)throw Error("OCR text exceeds 200,000 characters.");
   const bytes=format==="docx"?await markdownToDocx(edited):edited;
   const ok=await exportFile("vision-recognized-text."+format,bytes);
   setStatus(ok?"Saved locally; source image unchanged.":"Save cancelled.");
  }catch(e){setStatus("Save failed: "+toError(e));}
  finally{setBusy(false);}
 }
 async function savePack(){
  setBusy(true);setStatus("");
  try{
   const zip=await buildProjectPack(project);
   const ok=await exportFile("universal-box-project-kit.zip",zip);
   setStatus(ok?"Saved one ZIP containing real editable DOCX, PPTX, SVG diagram, outline and manifest.":"Save cancelled.");
  }catch(e){setStatus("Project generation failed: "+toError(e));}
  finally{setBusy(false);}
 }
 const update=<K extends keyof ProjectPackInput>(key:K,value:ProjectPackInput[K])=>{
  setProject(p=>({...p,[key]:value}));setStatus("");
 };
 return <section className="panel" aria-label="Sentinel Box OCR, screen capture and project kit">
  <p className="eyebrow">SENTINEL BOX · FREE NATIVE & CROSS-TOOL WORKFLOWS</p>
  <h2>OCR & Project Kit / 识字与一键成果工作台</h2>
  <p className="subtle">识别本地图片中的文字，选择一帧屏幕画面，或把一次项目输入组合为 Word、PowerPoint 和设计图的完整成果包。OCR 使用 macOS Apple Vision，不会自动上传文件。</p>
  <div className="pill-row" role="group" aria-label="OCR and cross tool modes">
   {([["ocr","本机 OCR 识字"],["capture","选屏截图"],["project","一键项目成果包"]] as const)
    .map(([id,label])=><button key={id} type="button" aria-pressed={mode===id} className={mode===id?"pill active-pill":"pill"}
     onClick={()=>{setMode(id);setStatus("");}}>{label}</button>)}
  </div>
  {(mode==="ocr"||mode==="capture")&&<>
   {mode==="capture"&&<>
    <h3>选择屏幕／窗口并截取单帧</h3>
    <p className="subtle">必须点击按钮并在系统共享选择器中明确授权；只截一帧、随后立即停止屏幕流。支持程度由 macOS WebView 或浏览器决定，不支持时请使用系统截图并导入。</p>
    <button data-testid="vision-screen-capture" type="button" className="primary-button" disabled={busy} onClick={()=>void screenShot()}>
     {busy?"正在处理…":"选择屏幕并截取一帧"}</button>
    <button data-testid="vision-capture-ocr-copy" type="button" className="secondary-button" disabled={busy||!isTauri()} onClick={()=>void captureRecognizeCopy()}>一键截图 → 本机识字 → 复制</button>
   </>}
   <label className="field-label">选择 PNG、JPEG 或 WebP 图片（最大 8 MB）
    <input data-testid="vision-image-input" className="field" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectFile}/>
   </label>
   {file&&<p className="subtle" data-testid="vision-file-info">已选择：{file.name} · {file.size} 字节</p>}
   <>
    <h3>Apple Vision · 本机文字识别</h3>
    <p className="subtle">仅 Mac 桌面应用具备识别接口；浏览器预览不能识别。支持由系统决定的文字语言，识别结果可能存在错误，请校对。</p>
    <label><input type="checkbox" checked={fast} onChange={e=>setFast(e.target.checked)}/> 快速识别模式（可能降低准确度）</label>
    <button data-testid="vision-run-ocr" type="button" className="primary-button" disabled={!file||busy||!isTauri()} onClick={()=>void recognize()}>本机识别图片文字</button>
    {!isTauri()&&<p data-testid="vision-native-unavailable" className="subtle">当前是浏览器预览；请使用 macOS Sentinel Box 桌面应用执行 Apple Vision OCR。</p>}
    {result&&<p data-testid="vision-result-lines" className="subtle">识别到 {result.length} 行。结果可编辑，导出之前请检查。</p>}
    {result&&<label className="field-label">识别结果 / 手动校正
     <textarea data-testid="vision-text-result" className="field text-editor" maxLength={200000} rows={12} value={edited} onChange={e=>setEdited(e.target.value)}/>
    </label>}
    {result&&<div className="actions">
     <button data-testid="vision-copy-text" className="primary-button" type="button" disabled={busy||!edited.trim()} onClick={()=>void copyOcrText()}>复制识别文字</button>
     <button data-testid="vision-save-txt" className="primary-button" type="button" disabled={busy||!edited.trim()} onClick={()=>void saveOcr("txt")}>导出 OCR TXT</button>
     <button data-testid="vision-save-docx" className="secondary-button" type="button" disabled={busy||!edited.trim()} onClick={()=>void saveOcr("docx")}>生成可编辑 Word DOCX</button>
    </div>}
   </>}
   {mode==="capture"&&file?.type==="image/png"&&<button data-testid="vision-save-screen" className="secondary-button" type="button" disabled={busy} onClick={()=>void saveScreenshot()}>保存 PNG 画面</button>}
  </>}
  {mode==="project"&&<>
   <h3>从一次项目输入，生成多种可编辑成果</h3>
   <p className="subtle">将一个项目大纲自动生成：Word 项目简报、PowerPoint 幻灯片、SVG 流程图、Markdown 原文与 JSON 文件清单，打包成一个 ZIP。成果文件可分别打开编辑；不是仅仅复制预览截图。</p>
   <label className="field-label">项目标题<input data-testid="vision-project-title" className="field" maxLength={100} value={project.title} onChange={e=>update("title",e.target.value)}/></label>
   <label className="field-label">副标题<input className="field" maxLength={180} value={project.subtitle} onChange={e=>update("subtitle",e.target.value)}/></label>
   <label className="field-label">配色主题
    <select className="field" value={project.theme} onChange={e=>update("theme",e.target.value as ProjectPackInput["theme"])}>
     <option value="ocean">海洋蓝</option><option value="forest">森林绿</option><option value="sunset">晚霞紫</option>
    </select>
   </label>
   <label className="field-label">演示大纲（每张内容页使用 ## 标题，后跟要点）
    <textarea data-testid="vision-project-outline" className="field text-editor" rows={10} maxLength={12000} value={project.outline} onChange={e=>update("outline",e.target.value)}/>
   </label>
   <label className="field-label">附加研究记录或工作笔记
    <textarea data-testid="vision-project-notes" className="field text-editor" rows={6} maxLength={12000} value={project.notes} onChange={e=>update("notes",e.target.value)}/>
   </label>
   {planned.error?<p role="alert" className="subtle">{planned.error}</p>:planned.plan&&<>
    <p data-testid="vision-project-preview" className="subtle">包含 {planned.plan.sections+1} 张幻灯片（含封面），6 个文件。</p>
    <div>{planned.plan.filenames.map(x=><p key={x} className="subtle">{x}</p>)}</div>
   </>}
   <button data-testid="vision-project-export" className="primary-button" type="button" disabled={busy||!!planned.error} onClick={()=>void savePack()}>一键生成 ZIP 成果包</button>
  </>}
  {status&&<p role="status" className="subtle">{status}</p>}
  <p className="subtle">隐私说明：用户主动选择图片、屏幕或文字；不会自动遍历磁盘。Mac 原生 OCR 在本机执行。请勿在未经许可时截取他人的私人信息。实际 macOS 截图、OCR 及 Office 字体布局需要设备验收。</p>
 </section>;
}
