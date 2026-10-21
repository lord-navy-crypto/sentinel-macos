import {useEffect,useMemo,useRef,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {inspectOffice,extractOfficeMedia,type OfficeReport} from "../lib/officeInspector";
import {renderDiagram,type DiagramInput} from "../lib/visualDiagrams";
export type ExtraMode="office"|"video"|"diagrams";
const TABS:{id:ExtraMode;label:string}[]=[
 {id:"office",label:"Word / PPT 内容提取"},
 {id:"video",label:"视频关键帧 / 分镜"},
 {id:"diagrams",label:"思维导图 / 时间线"},
];
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
function canvasPng(canvas:HTMLCanvasElement):Promise<Uint8Array>{
 return new Promise((resolve,reject)=>{
  canvas.toBlob(async blob=>{
   if(!blob)return reject(Error("Could not generate PNG image."));
   try{resolve(new Uint8Array(await blob.arrayBuffer()));}
   catch(e){reject(e);}
  },"image/png");
 });
}
function pauseAtFrame(video:HTMLVideoElement,t:number):Promise<void>{
 video.pause();
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=(reason?:Error)=>{
   if(done)return;done=true;
   video.removeEventListener("seeked",onSeek);
   video.removeEventListener("loadeddata",onSeek);
   video.removeEventListener("error",onError);
   clearTimeout(timer);
   reason?reject(reason):resolve();
  };
  const onSeek=()=>video.readyState>=2?finish():undefined;
  const onError=()=>finish(Error("Video decoding failed."));
  const timer=window.setTimeout(()=>finish(Error("Video frame unavailable or timed out.")),12000);
  video.addEventListener("seeked",onSeek);
  video.addEventListener("loadeddata",onSeek);
  video.addEventListener("error",onError);
  if(video.readyState>=2&&Math.abs(video.currentTime-t)<0.015){finish();return;}
  // Assigning currentTime changes its reported value before decoded pixels change.
  // Do not resolve here: wait for 'seeked' or 'loadeddata' to avoid repeated stale frames.
  try{video.currentTime=t;}catch(e){finish(e instanceof Error?e:Error(String(e)));}
 });
}
export default function ExtraCreationDesk({initialMode="office"}:{initialMode?:ExtraMode}){
 const [mode,setMode]=useState<ExtraMode>(initialMode),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const [officeName,setOfficeName]=useState(""),[officeData,setOfficeData]=useState<Uint8Array|null>(null),
  [report,setReport]=useState<OfficeReport|null>(null);
 const video=useRef<HTMLVideoElement>(null);
 const [videoFile,setVideoFile]=useState<File|null>(null),[videoSrc,setVideoSrc]=useState(""),
  [videoDuration,setVideoDuration]=useState(0),[videoTime,setVideoTime]=useState(0),[videoLoaded,setVideoLoaded]=useState(false);
 const [diagram,setDiagram]=useState<DiagramInput>({
  title:"我的学习计划",items:"发现问题 | 整理资料 | 提出目标\n设计方案 | 步骤一 | 步骤二\n实践行动 | 记录过程\n展示成果 | 收集反馈",
  mode:"mindmap",theme:"ocean",
 });
 useEffect(()=>{
  if(!videoFile){setVideoSrc("");return;}
  const url=URL.createObjectURL(videoFile);setVideoSrc(url);
  return ()=>{URL.revokeObjectURL(url);};
 },[videoFile]);
 const diagramPreview=useMemo(()=>{try{return {svg:renderDiagram(diagram),error:""};}
  catch(e){return {svg:"",error:err(e)};}},[diagram]);
 async function loadOffice(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];setStatus("");setReport(null);setOfficeData(null);
  if(!file)return;
  setOfficeName(file.name);setBusy(true);
  try{
   if(file.size>18_000_000)throw Error("Office file exceeds the 18 MB limit.");
   const bytes=new Uint8Array(await file.arrayBuffer());
   const r=await inspectOffice(file.name,bytes);
   setOfficeData(bytes);setReport(r);
   setStatus("读取成功。本机只读解析；没有上传文档。");
  }catch(e){setStatus("读取失败："+err(e));}
  finally{setBusy(false);}
 }
 async function exportOffice(kind:"text"|"media"){
  if(!officeData||!report)return;
  setBusy(true);setStatus("");
  try{
   const payload=kind==="text"?report.plainText:await extractOfficeMedia(officeName,officeData);
   const name=kind==="text"?"office-extracted-text.txt":"office-extracted-images.zip";
   setStatus(await exportFile(name,payload)?"已保存 "+name:"取消保存。");
  }catch(e){setStatus("导出失败："+err(e));}
  finally{setBusy(false);}
 }
 function uploadVideo(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];setStatus("");setVideoLoaded(false);setVideoDuration(0);setVideoTime(0);
  if(!f){setVideoFile(null);return;}
  if(f.size>120_000_000){setVideoFile(null);setStatus("视频超过 120 MB 本地处理上限。");return;}
  if(!/\.(mp4|mov|webm|m4v)$/iu.test(f.name)){
   setVideoFile(null);setStatus("请选择 MP4、MOV 或 WebM 视频。");return;
  }
  setVideoFile(f);
 }
 function drawVideo(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  const v=video.current!;
  ctx.fillStyle="#101827";ctx.fillRect(x,y,w,h);
  if(!v.videoWidth||!v.videoHeight)throw Error("This video does not provide decodable frames.");
  const scale=Math.min(w/v.videoWidth,h/v.videoHeight);
  const dw=v.videoWidth*scale,dh=v.videoHeight*scale;
  ctx.drawImage(v,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
 }
 async function saveVideo(kind:"frame"|"storyboard"){
  const v=video.current;if(!v||!videoFile)return;
  setBusy(true);setStatus("");
  try{
   if(!videoLoaded)throw Error("Video metadata is not ready.");
   if(kind==="storyboard"&&(!Number.isFinite(videoDuration)||videoDuration<=0))
    throw Error("This file has no seekable finite duration; export a single frame instead.");
   const c=document.createElement("canvas"),ctx=c.getContext("2d");
   if(!ctx)throw Error("Canvas unavailable.");
   if(kind==="frame"){
    c.width=960;c.height=540;
    await pauseAtFrame(v,videoTime);
    drawVideo(ctx,0,0,960,540);
   }else{
    const count=6; c.width=960;c.height=420;
    ctx.fillStyle="#0d182b";ctx.fillRect(0,0,c.width,c.height);
    for(let i=0;i<count;i++){
     const t=Math.max(0,Math.min(videoDuration-0.05,videoDuration*(i+0.5)/count));
     await pauseAtFrame(v,t);
     const x=(i%3)*320,y=Math.floor(i/3)*210;
     drawVideo(ctx,x,y,320,180);
     ctx.fillStyle="#ffffff";ctx.font="16px Arial";ctx.fillText(t.toFixed(1)+"s",x+12,y+201);
    }
   }
   const bytes=await canvasPng(c);
   setStatus(await exportFile(kind==="frame"?"video-frame.png":"video-storyboard.png",bytes)?
    "已保存本机 PNG。视频原件未修改。":"取消保存。");
  }catch(e){setStatus("视频处理失败："+err(e));}
  finally{setBusy(false);}
 }
 async function saveDiagram(){
  setBusy(true);setStatus("");
  try{const bytes=renderDiagram(diagram);
   setStatus(await exportFile(diagram.mode==="mindmap"?"mind-map.svg":"timeline.svg",bytes)?
    "SVG 导出成功（本机生成）":"取消保存。");
  }catch(e){setStatus("制作失败："+err(e));}
  finally{setBusy(false);}
 }
 return <section className="panel" aria-label="More free tools studio">
  <p className="eyebrow">UNIVERSAL BOX · MORE FREE EVERYDAY TOOLS</p>
  <h2>更多免费实用工具 / Everyday Studio</h2>
  <p className="subtle">这组工具覆盖办公文件读取、视频关键帧，以及图形化创作。操作默认在本机完成，不要求账户，也不会静默上传或覆盖源文件。</p>
  <div className="pill-row" role="group" aria-label="More tools tabs">
   {TABS.map(item=><button key={item.id} type="button" className={mode===item.id?"pill active-pill":"pill"}
    aria-pressed={mode===item.id} onClick={()=>{setMode(item.id);setStatus("");}}>{item.label}</button>)}
  </div>
  {mode==="office"&&<>
   <h3>Office 内容与媒体资源提取</h3>
   <p className="subtle">导入本地 .docx 或 .pptx，查看段落／幻灯片文本，导出 .txt，并从文档内提取有效的 PNG、JPEG、GIF 或 WebP 图片到 ZIP。按幻灯片顺序显示；不会执行宏、打开超链接或联网上传。复杂排版、图表、公式不保证还原。</p>
   <label className="field-label">选择 Word 或 PowerPoint 文件
    <input data-testid="extra-office-file" type="file" accept=".docx,.pptx" className="field" onChange={e=>void loadOffice(e)}/>
   </label>
   {report&&<div data-testid="extra-office-report">
    <p className="subtle">{officeName} · {report.kind.toUpperCase()} · {report.sections.length} 段/页 · {report.images.length} 张支持的图片 · {report.files} 个归档项目</p>
    <div style={{maxHeight:330,overflow:"auto",border:"1px solid #d8e2ed",borderRadius:8,padding:14}}>
     {report.sections.slice(0,60).map((section,i)=><div key={i} style={{marginBottom:14}}>
      <strong>{section.heading}</strong><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",margin:"5px 0"}}>{section.text.slice(0,2000)}</p>
     </div>)}
    </div>
    <div className="actions">
     <button data-testid="extra-office-text" className="primary-button" type="button" disabled={busy} onClick={()=>void exportOffice("text")}>保存提取文本 TXT</button>
     <button data-testid="extra-office-media" className="secondary-button" type="button" disabled={busy||!report.images.length} onClick={()=>void exportOffice("media")}>提取图片 ZIP</button>
    </div>
   </div>}
  </>}
  {mode==="video"&&<>
   <h3>Video Quick Actions · 视频截图与分镜表</h3>
   <p className="subtle">本地上传可解码的 MP4、MOV、WebM（受系统编解码器支持情况影响），选择秒数保存 PNG 帧；或从可定位的视频中提取 6 张缩略图制成 3×2 分镜拼版。不会改变视频、转码、录屏或发送文件。</p>
   <label className="field-label">选择本机视频（最大 120 MB）
    <input data-testid="extra-video-file" className="field" type="file" accept="video/mp4,video/webm,video/quicktime,.mov,.m4v" onChange={uploadVideo}/>
   </label>
   {videoSrc&&<div>
    <video data-testid="extra-video-preview" ref={video} src={videoSrc} controls muted playsInline preload="auto"
     style={{width:"100%",maxWidth:640,maxHeight:380,background:"#0c192a",borderRadius:9}}
     onLoadedMetadata={e=>{
      const d=e.currentTarget.duration;
      setVideoDuration(Number.isFinite(d)?d:0);
      setVideoLoaded(true);
     }}
     onError={()=>{setVideoLoaded(false);setStatus("本机解码器无法打开此视频格式。");}}/>
    <p className="subtle">{videoFile?.name} · 时长：{videoDuration>0?videoDuration.toFixed(2)+"s":"未知/不可定位"} · 格式支持取决于此设备</p>
    <label className="field-label">截图时间（秒）
     <input data-testid="extra-video-time" type="number" className="field" min={0} max={videoDuration||0} step="0.1"
      value={videoTime} onChange={e=>setVideoTime(Math.max(0,Math.min(videoDuration||0,Number(e.target.value)||0)))}/>
    </label>
    <div className="actions">
     <button data-testid="extra-video-frame" type="button" className="primary-button" disabled={busy||!videoLoaded} onClick={()=>void saveVideo("frame")}>导出单帧 PNG</button>
     <button data-testid="extra-video-storyboard" type="button" className="secondary-button" disabled={busy||!videoLoaded||!videoDuration} onClick={()=>void saveVideo("storyboard")}>生成 6 帧分镜 PNG</button>
    </div>
   </div>}
  </>}
  {mode==="diagrams"&&<>
   <h3>思维导图 / 项目时间线</h3>
   <p className="subtle">每行一个主题，使用 | 分隔最多三个子要点。自由选择思维导图或里程碑时间线、三种原创主题。直接输出矢量 SVG，无水印；不支持任意节点拖拽或多人同步。</p>
   <label className="field-label">图形类型
    <select data-testid="extra-diagram-kind" className="field" value={diagram.mode} onChange={e=>setDiagram(old=>({...old,mode:e.target.value as DiagramInput["mode"]}))}>
     <option value="mindmap">思维导图</option><option value="timeline">项目时间线</option>
    </select>
   </label>
   <label className="field-label">标题<input data-testid="extra-diagram-title" className="field" maxLength={70} value={diagram.title} onChange={e=>setDiagram(old=>({...old,title:e.target.value}))}/></label>
   <label className="field-label">节点 / 里程碑<textarea data-testid="extra-diagram-items" className="field text-editor" maxLength={2500} rows={7} value={diagram.items} onChange={e=>setDiagram(old=>({...old,items:e.target.value}))}/></label>
   <label className="field-label">主题颜色
    <select className="field" value={diagram.theme} onChange={e=>setDiagram(old=>({...old,theme:e.target.value as DiagramInput["theme"]}))}>
     <option value="ocean">海洋蓝</option><option value="forest">森林绿</option><option value="sunset">晚霞紫</option>
    </select>
   </label>
   {diagramPreview.error?<p className="subtle" role="alert">{diagramPreview.error}</p>:
    <img data-testid="extra-diagram-preview" alt="Generated diagram preview" src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(diagramPreview.svg)}
     style={{display:"block",maxWidth:730,width:"100%",maxHeight:480,objectFit:"contain",border:"1px solid #d8e2ed",borderRadius:9}}/>}
   <button data-testid="extra-diagram-export" className="primary-button" type="button" disabled={busy||!!diagramPreview.error} onClick={()=>void saveDiagram()}>导出 SVG 图形</button>
  </>}
  {status&&<p role="status" className="subtle">{status}</p>}
  <p className="subtle">隐私提示：内容通过浏览器本地文件读取、解码与画布制作。结果只在点击保存时写出；剪裁不会更改源文件。本工具不声称能消除文件中的所有隐私元数据。</p>
 </section>;
}
