import {type PointerEvent,useEffect,useRef,useState} from "react";
import {exportFile} from "../lib/output";

const COLORS=["#ef4444","#2563eb","#16a34a","#f59e0b","#ffffff","#111827"];
export default function ImageAnnotationDesk({file}:{file:File|null}){
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const undoRef=useRef<ImageData[]>([]);
 const painting=useRef(false);
 const [color,setColor]=useState(COLORS[0]);
 const [penWidth,setPenWidth]=useState(4);
 const [ready,setReady]=useState(false);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [undoCount,setUndoCount]=useState(0);
 useEffect(()=>{
  let alive=true;
  const canvas=canvasRef.current;
  setReady(false);setStatus("");
  undoRef.current=[];setUndoCount(0);
  if(!file||!canvas)return;
  if(!/^image\/(jpeg|png|webp)$/u.test(file.type)){setStatus("Choose a JPEG, PNG or WebP image.");return;}
  if(file.size>8_000_000){setStatus("Annotation accepts images up to 8 MB.");return;}
  const url=URL.createObjectURL(file);
  const image=new Image();
  image.onload=()=>{
   if(!alive)return;
   if(image.naturalWidth*image.naturalHeight>32_000_000){setStatus("Image exceeds 32 megapixels.");return;}
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
  image.src=url;
  return()=>{alive=false;URL.revokeObjectURL(url);};
 },[file]);
 function coords(event:PointerEvent<HTMLCanvasElement>){
  const canvas=event.currentTarget;
  const rect=canvas.getBoundingClientRect();
  return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};
 }
 function start(event:PointerEvent<HTMLCanvasElement>){
  if(!ready)return;
  const canvas=event.currentTarget,ctx=canvas.getContext("2d");
  if(!ctx)return;
  undoRef.current.push(ctx.getImageData(0,0,canvas.width,canvas.height));
  if(undoRef.current.length>8)undoRef.current.shift();
  setUndoCount(undoRef.current.length);
  const p=coords(event);
  ctx.beginPath();ctx.moveTo(p.x,p.y);
  ctx.lineWidth=penWidth;ctx.strokeStyle=color;ctx.lineCap="round";ctx.lineJoin="round";
  ctx.lineTo(p.x+.01,p.y+.01);ctx.stroke();
  painting.current=true;
  canvas.setPointerCapture(event.pointerId);
 }
 function move(event:PointerEvent<HTMLCanvasElement>){
  if(!ready||!painting.current)return;
  const ctx=event.currentTarget.getContext("2d");
  if(!ctx)return;
  const p=coords(event);
  ctx.lineTo(p.x,p.y);ctx.stroke();
 }
 function stop(event:PointerEvent<HTMLCanvasElement>){
  painting.current=false;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function undo(){
  const canvas=canvasRef.current,ctx=canvas?.getContext("2d"),image=undoRef.current.pop();
  if(canvas&&ctx&&image){ctx.putImageData(image,0,0);setUndoCount(undoRef.current.length);setStatus("Last stroke undone.");}
 }
 async function save(){
  const canvas=canvasRef.current;
  if(!canvas||!ready)return;
  setBusy(true);
  try{
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("PNG encoding failed")),"image/png"));
   const base=file?.name.replace(/\.[^.]+$/u,"").replace(/[^\p{L}\p{N}._-]/gu,"-").slice(0,60)||"image";
   const ok=await exportFile(base+"-annotated.png",new Uint8Array(await blob.arrayBuffer()));
   setStatus(ok?"Saved a new annotated PNG; original file untouched.":"Save cancelled.");
  }catch(error){setStatus("Save failed: "+String(error));}
  finally{setBusy(false);}
 }
 return <section className="panel">
  <h3>Draw on image · 图片手绘标注</h3>
  <p className="subtle">Pointer/stylus drawing, pen colors and sizes, up to 8 undo steps, PNG export. Original source file is unchanged.</p>
  {!file&&<p className="subtle">Choose an image above to begin.</p>}
  <div className="actions">
   <label className="field-label">Pen color
    <select className="field" value={color} onChange={e=>setColor(e.target.value)}>
     {COLORS.map(c=><option key={c} value={c}>{c}</option>)}
    </select>
   </label>
   <label className="field-label">Pen size {penWidth}px
    <input className="field" type="range" min={1} max={24} step={1} value={penWidth} onChange={e=>setPenWidth(Number(e.target.value))}/>
   </label>
   <button type="button" className="secondary-button" disabled={!ready||!undoCount} onClick={undo}>Undo stroke</button>
   <button type="button" className="primary-button" disabled={!ready||busy} onClick={()=>{void save();}}>{busy?"Saving…":"Save annotated PNG"}</button>
  </div>
  <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}
    aria-label="Draw annotations on the selected image" style={{width:"100%",maxWidth:720,height:"auto",background:"#e2e8f0",touchAction:"none",border:"1px solid #cbd5e1",borderRadius:10,cursor:ready?"crosshair":"default"}}/>
  {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}