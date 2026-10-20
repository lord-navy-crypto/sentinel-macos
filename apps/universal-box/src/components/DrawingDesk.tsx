import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { DeskStroke } from "../lib/workspace";
import { exportFile } from "../lib/output";

type Props = { strokes: DeskStroke[]; onChange: (strokes: DeskStroke[]) => void };
const W = 1100;
const H = 600;
function paint(ctx: CanvasRenderingContext2D, stroke: DeskStroke) {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width * 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  const first = stroke.points[0];
  ctx.moveTo(first[0] * W, first[1] * H);
  stroke.points.slice(1).forEach(([x,y])=>ctx.lineTo(x*W,y*H));
  if(stroke.points.length===1){ctx.arc(first[0]*W,first[1]*H,stroke.width,0,Math.PI*2);ctx.fill();}
  else ctx.stroke();
}
export default function DrawingDesk({strokes,onChange}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const active=useRef<DeskStroke|null>(null);
  const [color,setColor]=useState("#ffffff");
  const [width,setWidth]=useState(3);
  const [status,setStatus]=useState("");
  const redraw=()=>{
    const ctx=canvas.current?.getContext("2d");
    if(!ctx)return;
    ctx.fillStyle="#111b2b";
    ctx.fillRect(0,0,W,H);
    strokes.forEach(path=>paint(ctx,path));
  };
  useEffect(()=>{redraw();},[strokes]);
  const pointerPoint=(event:PointerEvent<HTMLCanvasElement>):[number,number]=>{
    const rect=event.currentTarget.getBoundingClientRect();
    return [Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))];
  };
  const down=(event:PointerEvent<HTMLCanvasElement>)=>{
    if(event.button!==0&&event.pointerType==="mouse")return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p=pointerPoint(event);
    active.current={color,width,points:[p]};
    const ctx=canvas.current?.getContext("2d");
    if(ctx)paint(ctx,active.current);
  };
  const move=(event:PointerEvent<HTMLCanvasElement>)=>{
    const current=active.current;
    if(!current)return;
    const p=pointerPoint(event),prev=current.points[current.points.length-1];
    if(Math.hypot(p[0]-prev[0],p[1]-prev[1])<.003||current.points.length>=400)return;
    const ctx=canvas.current?.getContext("2d");
    if(ctx){
      ctx.strokeStyle=current.color;ctx.lineWidth=current.width*2;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(prev[0]*W,prev[1]*H);ctx.lineTo(p[0]*W,p[1]*H);ctx.stroke();
    }
    current.points.push(p);
  };
  const up=()=>{
    const current=active.current;
    active.current=null;
    if(current)onChange([...strokes.slice(-99),current]);
  };
  const exportDrawing=async()=>{
    try{
      const element=canvas.current;
      if(!element)throw new Error("Drawing canvas unavailable");
      const blob=await new Promise<Blob>((resolve,reject)=>element.toBlob(v=>v?resolve(v):reject(new Error("Canvas export failed")),"image/png"));
      const saved=await exportFile("daily-desk-drawing.png",new Uint8Array(await blob.arrayBuffer()));
      setStatus(saved?"Drawing saved to PNG.":"Save cancelled.");
    }catch(e){setStatus(e instanceof Error?e.message:String(e))}
  };
  return <section className="panel">
    <p className="eyebrow">DRAFT PAPER · OFFLINE SKETCHING</p><h2>Black drawing board</h2>
    <p className="subtle">Mouse or stylus drawing, local undo/clear, and PNG export. Your strokes are saved with the workspace and can be restored from its backup.</p>
    <div className="actions">
      <label className="field-label">Ink <input type="color" value={color} onChange={e=>setColor(e.target.value)} /></label>
      <label className="field-label">Pen width <input className="field" type="number" min={1} max={24} value={width} onChange={e=>setWidth(Math.max(1,Math.min(24,Number(e.target.value)||3)))}/></label>
      <button type="button" className="secondary-button" onClick={()=>onChange(strokes.slice(0,-1))} disabled={!strokes.length}>Undo</button>
      <button type="button" className="secondary-button" onClick={()=>{if(window.confirm("Clear the entire drawing?"))onChange([]);}} disabled={!strokes.length}>Clear</button>
      <button type="button" className="primary-button" onClick={()=>{void exportDrawing();}}>Save PNG</button>
    </div>
    <canvas ref={canvas} className="drawing-canvas" width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Black drawing canvas" style={{touchAction:"none"}}/>
    <p className="subtle">{strokes.length} saved stroke(s) · limit 100 strokes of up to 400 points each.</p>
    {status&&<p role="status" className="subtle">{status}</p>}
  </section>;
}
