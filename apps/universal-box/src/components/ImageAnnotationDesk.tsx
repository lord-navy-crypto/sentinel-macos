import {type PointerEvent,useEffect,useRef,useState} from "react";
import {exportFile} from "../lib/output";

/** Pixels are flattened into a newly generated PNG. Original files are never rewritten. */
type Tool="pen"|"rectangle"|"arrow"|"redact"|"text";
type Point={x:number;y:number};
const COLORS=["#ef4444","#2563eb","#16a34a","#f59e0b","#ffffff","#111827"];
function drawShape(ctx:CanvasRenderingContext2D,tool:Tool,from:Point,to:Point,color:string,width:number,label:string){
 ctx.save();ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.strokeStyle=color;
 if(tool==="rectangle"){
  ctx.strokeRect(from.x,from.y,to.x-from.x,to.y-from.y);
 }else if(tool==="redact"){
  // OPAQUE pixels: unlike blur/pixelation, original pixels are absent from exported PNG.
  ctx.fillStyle="#000000";ctx.globalAlpha=1;
  ctx.fillRect(Math.min(from.x,to.x),Math.min(from.y,to.y),Math.abs(to.x-from.x),Math.abs(to.y-from.y));
 }else if(tool==="arrow"){
  const angle=Math.atan2(to.y-from.y,to.x-from.x),head=Math.max(12,width*4);
  ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);
  ctx.moveTo(to.x-head*Math.cos(angle-.55),to.y-head*Math.sin(angle-.55));
  ctx.lineTo(to.x,to.y);ctx.lineTo(to.x-head*Math.cos(angle+.55),to.y-head*Math.sin(angle+.55));
  ctx.stroke();
 }else if(tool==="text"){
  ctx.font="bold "+Math.max(18,width*5)+"px Arial, sans-serif";
  ctx.fillStyle=color;ctx.textBaseline="top";
  ctx.fillText(label,to.x,to.y,Math.max(1,ctx.canvas.width-to.x-3));
 }
 ctx.restore();
}
export default function ImageAnnotationDesk({file}:{file:File|null}){
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const history=useRef<ImageData[]>([]);
 const down=useRef<{origin:Point;snapshot:ImageData}|null>(null);
 const [tool,setTool]=useState<Tool>("pen"),[text,setText]=useState("重点"),
  [color,setColor]=useState(COLORS[0]),[penWidth,setPenWidth]=useState(4),
  [ready,setReady]=useState(false),[status,setStatus]=useState(""),
  [busy,setBusy]=useState(false),[undoCount,setUndoCount]=useState(0);
 useEffect(()=>{
  let alive=true;const canvas=canvasRef.current;
  setReady(false);setStatus("");history.current=[];setUndoCount(0);down.current=null;
  if(!file||!canvas)return;
  if(!/^image\/(jpeg|png|webp)$/u.test(file.type)){setStatus("Choose a JPEG, PNG or WebP image.");return;}
  if(file.size>8_000_000){setStatus("Annotation accepts images up to 8 MB.");return;}
  const url=URL.createObjectURL(file),image=new Image();
  image.onload=()=>{
   if(!alive)return;
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>32_000_000){
    setStatus("Invalid image size or image exceeds 32 megapixels.");return;
   }
   const scale=Math.min(1,1400/image.naturalWidth,1400/image.naturalHeight);
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const ctx=canvas.getContext("2d");
   if(!ctx){setStatus("Canvas unavailable.");return;}
   ctx.clearRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   setReady(true);
  };
  image.onerror=()=>{if(alive)setStatus("This image could not be loaded.");};
  image.src=url;return()=>{alive=false;URL.revokeObjectURL(url);};
 },[file]);
 function coords(event:PointerEvent<HTMLCanvasElement>):Point{
  const canvas=event.currentTarget,rect=canvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(canvas.width,(event.clientX-rect.left)*canvas.width/rect.width)),
   y:Math.max(0,Math.min(canvas.height,(event.clientY-rect.top)*canvas.height/rect.height))};
 }
 function start(event:PointerEvent<HTMLCanvasElement>){
  if(!ready||(event.pointerType==="mouse"&&event.button!==0)||down.current)return;
  const canvas=event.currentTarget,ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return;
  const snapshot=ctx.getImageData(0,0,canvas.width,canvas.height);
  history.current.push(snapshot);if(history.current.length>8)history.current.shift();
  setUndoCount(history.current.length);
  const p=coords(event);
  if(tool==="text"){
   drawShape(ctx,"text",p,p,color,penWidth,text.trim());
   return;
  }
  down.current={origin:p,snapshot};
  if(tool==="pen"){
   ctx.beginPath();ctx.moveTo(p.x,p.y);
   ctx.lineWidth=penWidth;ctx.strokeStyle=color;ctx.lineJoin="round";ctx.lineCap="round";
   ctx.lineTo(p.x+0.01,p.y+0.01);ctx.stroke();
  }
  canvas.setPointerCapture(event.pointerId);
 }
 function move(event:PointerEvent<HTMLCanvasElement>){
  if(!ready||!down.current)return;
  const ctx=event.currentTarget.getContext("2d",{willReadFrequently:true});if(!ctx)return;
  const p=coords(event);
  if(tool==="pen"){ctx.lineTo(p.x,p.y);ctx.stroke();}
  else{
   ctx.putImageData(down.current.snapshot,0,0);
   drawShape(ctx,tool,down.current.origin,p,color,penWidth,text);
  }
 }
 function stop(event:PointerEvent<HTMLCanvasElement>){
  if(!down.current)return;
  const ctx=event.currentTarget.getContext("2d",{willReadFrequently:true});
  if(ctx&&tool!=="pen"){
   ctx.putImageData(down.current.snapshot,0,0);
   drawShape(ctx,tool,down.current.origin,coords(event),color,penWidth,text);
  }
  down.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function undo(){
  const canvas=canvasRef.current,ctx=canvas?.getContext("2d",{willReadFrequently:true}),snapshot=history.current.pop();
  if(canvas&&ctx&&snapshot){ctx.putImageData(snapshot,0,0);setUndoCount(history.current.length);setStatus("Last edit undone.");}
 }
 async function save(){
  const canvas=canvasRef.current;if(!canvas||!ready||busy)return;
  setBusy(true);setStatus("");
  try{
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("PNG encoding failed")),"image/png"));
   const base=file?.name.replace(/\.[^.]+$/u,"").replace(/[^\p{L}\p{N}._-]/gu,"-").slice(0,60)||"image";
   const saved=await exportFile(base+"-annotated.png",new Uint8Array(await blob.arrayBuffer()));
   setStatus(saved?"Saved a new flattened PNG; original file untouched.":"Save cancelled.");
  }catch(e){setStatus("Save failed: "+String(e));}
  finally{setBusy(false);}
 }
 return <section className="panel">
  <h3>图片与截图标注 · Annotation Studio</h3>
  <p className="subtle">在选定图片上手绘、画框、箭头、加文字，或使用实心遮挡覆盖像素；最多可撤销 8 步。结果是新生成的 PNG，不修改原图。</p>
  {!file&&<p className="subtle">Choose an image above to begin.</p>}
  <div className="actions">
   <label className="field-label">工具
    <select data-testid="annotation-tool" className="field" value={tool} onChange={e=>setTool(e.target.value as Tool)}>
     <option value="pen">手绘笔 Pen</option><option value="rectangle">矩形 Rectangle</option>
     <option value="arrow">箭头 Arrow</option><option value="text">文字 Text</option>
     <option value="redact">实心遮挡 Opaque blackout</option>
    </select>
   </label>
   <label className="field-label">颜色
    <select className="field" value={color} onChange={e=>setColor(e.target.value)}>{COLORS.map(c=><option key={c} value={c}>{c}</option>)}</select>
   </label>
   <label className="field-label">线条宽度 {penWidth}px
    <input className="field" type="range" min={1} max={24} step={1} value={penWidth} onChange={e=>setPenWidth(Number(e.target.value))}/>
   </label>
   {tool==="text"&&<label className="field-label">标注文字
    <input data-testid="annotation-text" className="field" maxLength={80} value={text} onChange={e=>setText(e.target.value)}/>
   </label>}
   <button type="button" data-testid="annotation-undo" className="secondary-button" disabled={!ready||!undoCount} onClick={undo}>Undo</button>
   <button type="button" data-testid="annotation-export" className="primary-button" disabled={!ready||busy} onClick={()=>void save()}>{busy?"Saving…":"导出 PNG"}</button>
  </div>
  <canvas data-testid="annotation-canvas" ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}
   aria-label="Draw annotations on the selected image" style={{display:"block",width:"100%",maxWidth:720,height:"auto",background:"#e2e8f0",touchAction:"none",border:"1px solid #cbd5e1",borderRadius:10,cursor:ready?"crosshair":"default"}}/>
  <p className="subtle">实心黑色遮挡会替换输出图片中的对应像素，不是可以揭开的图层；但请检查实际遮挡范围。它不处理原文件的其他副本、网页历史或其他位置的私人信息。</p>
  {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}