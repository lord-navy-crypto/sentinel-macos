import {useEffect,useRef,useState,type PointerEvent} from "react";
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy,type PDFPageProxy} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {pdfLinkRectangleFromDrag,type ScreenPoint} from "../lib/pdfLinkPickerGeometry";

GlobalWorkerOptions.workerSrc=pdfWorker;

type Viewport=ReturnType<PDFPageProxy["getViewport"]>;
type Drag={start:ScreenPoint;end:ScreenPoint};
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
export default function PdfLinkRegionPicker({file,pageNumber,onChoose}:{
 file:File;pageNumber:number;
 onChoose:(rect:{x:number;y:number;width:number;height:number})=>void;
}){
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const viewportRef=useRef<{viewport:Viewport;view:[number,number,number,number]}|null>(null);
 const [drag,setDrag]=useState<Drag|null>(null);
 const [status,setStatus]=useState("正在本地渲染 PDF 页面…");
 const [ready,setReady]=useState(false);

 useEffect(()=>{
  let active=true;
  let task:ReturnType<PDFPageProxy["render"]>|null=null;
  let pdf:PDFDocumentProxy|null=null;
  setDrag(null);setReady(false);viewportRef.current=null;
  void (async()=>{
   try{
    if(file.size>15_000_000)throw Error("Preview exceeds 15 MB limit");
    const load=getDocument({data:new Uint8Array(await file.arrayBuffer())});
    pdf=await load.promise;
    if(!active)return;
    if(pageNumber<1||pageNumber>pdf.numPages)throw Error("Selected page is out of range");
    const page=await pdf.getPage(pageNumber);
    const base=page.getViewport({scale:1});
    const scale=Math.min(2,620/base.width);
    const viewport=page.getViewport({scale});
    const canvas=canvasRef.current;
    if(!canvas)throw Error("Canvas not available");
    const ctx=canvas.getContext("2d");
    if(!ctx)throw Error("Canvas rendering unavailable");
    const ratio=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.floor(viewport.width*ratio);
    canvas.height=Math.floor(viewport.height*ratio);
    canvas.style.width=viewport.width+"px";
    canvas.style.height=viewport.height+"px";
    task=page.render({canvasContext:ctx,viewport,transform:[ratio,0,0,ratio,0,0]});
    await task.promise;
    if(!active)return;
    const view=page.view;
    if(view.length!==4)throw Error("Unsupported PDF CropBox");
    viewportRef.current={viewport,view:[view[0],view[1],view[2],view[3]]};
    setReady(true);
    setStatus("拖动鼠标框选目标文字或图片区域，释放后自动填入 PDF 坐标。");
   }catch(e){if(active)setStatus("Link region preview unavailable: "+String(e));}
  })();
  return ()=>{active=false;task?.cancel();void pdf?.destroy().catch(()=>{});};
 },[file,pageNumber]);

 function location(e:PointerEvent<HTMLDivElement>):ScreenPoint{
  const rect=e.currentTarget.getBoundingClientRect();
  const v=viewportRef.current?.viewport;
  if(!v||rect.width<=0||rect.height<=0)return {x:0,y:0};
  return {
   x:clamp((e.clientX-rect.left)*v.width/rect.width,0,v.width),
   y:clamp((e.clientY-rect.top)*v.height/rect.height,0,v.height),
  };
 }
 function onStart(e:PointerEvent<HTMLDivElement>){
  if(!ready||e.button!==0)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  const point=location(e);
  setDrag({start:point,end:point});
 }
 function onMove(e:PointerEvent<HTMLDivElement>){
  if(drag)setDrag(current=>current?{...current,end:location(e)}:null);
 }
 function onEnd(e:PointerEvent<HTMLDivElement>){
  if(!drag||!viewportRef.current)return;
  const end=location(e);
  const info=viewportRef.current;
  try{
   const rect=pdfLinkRectangleFromDrag({...info.viewport,view:info.view},drag.start,end);
   onChoose(rect);
   setStatus("已框选位置并填入 PDF 坐标；确认 URL 后点击「添加可点击区域」，原文件不变。");
  }catch(err){setStatus(err instanceof Error?err.message:String(err));}
  setDrag(null);
 }
 const renderRect=drag?{
  left:Math.min(drag.start.x,drag.end.x),top:Math.min(drag.start.y,drag.end.y),
  width:Math.abs(drag.start.x-drag.end.x),height:Math.abs(drag.start.y-drag.end.y),
 }:null;
 const v=viewportRef.current?.viewport;
 return <section className="panel" aria-label="Visual PDF hyperlink region picker">
  <h4>在 PDF 页面上框选超链接位置 · 可视化选区</h4>
  <p className="subtle">当前第 {pageNumber} 页。此页面仅作为选取坐标的预览，不会打开文档中的任何网址。页面旋转、CropBox 偏移由 PDF 坐标转换处理。</p>
  <div style={{overflow:"auto",maxHeight:680,padding:8,background:"var(--surface-secondary,#e8edf4)",borderRadius:12}}>
   <div style={{position:"relative",width:"fit-content",lineHeight:0}}>
    <canvas ref={canvasRef} aria-label="PDF page rendered locally for area selection"/>
    {ready&&v&&<div
      role="application" aria-label="Drag to select hyperlink region on PDF page"
      onPointerDown={onStart} onPointerMove={onMove} onPointerUp={onEnd}
      onPointerCancel={()=>setDrag(null)}
      style={{position:"absolute",inset:0,width:v.width,height:v.height,
       touchAction:"none",cursor:"crosshair"}}>
      {renderRect&&<div style={{position:"absolute",pointerEvents:"none",
       left:renderRect.left,top:renderRect.top,width:renderRect.width,height:renderRect.height,
       border:"2px solid #2563eb",background:"rgba(37,99,235,0.18)",boxSizing:"border-box"}}/>}
    </div>}
   </div>
  </div>
  <p className="subtle" role="status">{status}</p>
 </section>;
}
