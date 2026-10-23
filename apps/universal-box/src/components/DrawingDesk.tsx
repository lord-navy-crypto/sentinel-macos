import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { DeskStroke } from "../lib/workspace";
import { exportFile } from "../lib/output";
import {drawingToSvg,shapeStroke,type ShapeMode} from "../lib/drawingVector";

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
  const [mode,setMode]=useState<ShapeMode>("pen");
  const previous=useRef<DeskStroke[][]>([]);
  const future=useRef<DeskStroke[][]>([]);
  function changeDrawing(next:DeskStroke[]){
    previous.current.push(strokes);
    if(previous.current.length>20)previous.current.shift();
    future.current=[];
    onChange(next);
  }
  function undo(){
    const before=previous.current.pop();
    if(!before)return;
    future.current.push(strokes);
    onChange(before);
  }
  function redo(){
    const after=future.current.pop();
    if(!after)return;
    previous.current.push(strokes);
    onChange(after);
  }
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
    const p=pointerPoint(event);
    if(mode!=="pen"){
      active.current=shapeStroke(mode,current.points[0],p,current.color,current.width);
      redraw();
      const ctx=canvas.current?.getContext("2d");
      if(ctx)paint(ctx,active.current);
      return;
    }
    const prev=current.points[current.points.length-1];
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
    if(current){
      const finished=mode==="pen"?current:shapeStroke(mode,current.points[0],
       current.points[mode==="line"?1:2]??current.points[0],current.color,current.width);
      changeDrawing([...strokes.slice(-99),finished]);
    }
  };
  const cancel=()=>{active.current=null;redraw();};
  const copyDrawing=async()=>{
    try{
      const element=canvas.current;
      if(!element||typeof ClipboardItem==="undefined"||!navigator.clipboard?.write)
        throw Error("PNG clipboard unavailable.");
      const blob=await new Promise<Blob>((resolve,reject)=>
        element.toBlob(b=>b?resolve(b):reject(Error("PNG encoding failed.")),"image/png"));
      await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);
      setStatus("Copied PNG image to system clipboard.");
    }catch(e){setStatus("Copy unavailable: "+String(e instanceof Error?e.message:e)+
      " Use Save PNG instead.");}
  };
  const saveSvg=async()=>{
    try{
      const output=drawingToSvg(strokes);
      const saved=await exportFile("daily-desk-drawing.svg",output);
      setStatus(saved?"Saved editable vector paths as SVG.":"Save cancelled.");
    }catch(e){setStatus(String(e instanceof Error?e.message:e));}
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
    <p className="subtle">Freehand pen, straight lines and rectangles with undo/redo, PNG copy, and scalable SVG export. Local strokes remain in workspace backup; no image upload or cloud account.</p>
    <div className="actions">
      <label className="field-label">Draw tool
        <select className="field" data-testid="drawing-tool" value={mode}
          onChange={e=>setMode(e.target.value as ShapeMode)}>
          <option value="pen">Freehand pen</option>
          <option value="line">Straight line</option>
          <option value="rectangle">Rectangle outline</option>
        </select>
      </label>
      <label className="field-label">Ink <input type="color" value={color} onChange={e=>setColor(e.target.value)} /></label>
      <label className="field-label">Pen width <input className="field" type="number" min={1} max={24} value={width} onChange={e=>setWidth(Math.max(1,Math.min(24,Number(e.target.value)||3)))}/></label>
      <button type="button" className="secondary-button" data-testid="drawing-undo"
        onClick={undo} disabled={!previous.current.length}>Undo</button>
      <button type="button" className="secondary-button" data-testid="drawing-redo"
        onClick={redo} disabled={!future.current.length}>Redo</button>
      <button type="button" className="secondary-button" onClick={()=>{if(window.confirm("Clear the entire drawing?"))changeDrawing([]);}} disabled={!strokes.length}>Clear</button>
      <button type="button" className="primary-button" onClick={()=>{void exportDrawing();}}>Save PNG</button>
      <button type="button" className="secondary-button" data-testid="drawing-save-svg"
        onClick={()=>{void saveSvg();}}>Save vector SVG</button>
      <button type="button" className="secondary-button" data-testid="drawing-copy-png"
        onClick={()=>{void copyDrawing();}}>Copy PNG</button>
    </div>
    <canvas ref={canvas} className="drawing-canvas" width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} aria-label="Black drawing canvas" style={{touchAction:"none"}}/>
    <p className="subtle">{strokes.length} saved stroke(s) · limit 100 strokes of up to 400 points each. SVG exports vector geometry; PNG captures the rendered canvas. Clipboard permission depends on the operating system.</p>
    {status&&<p role="status" className="subtle">{status}</p>}
  </section>;
}
