import { useMemo, useState, type PointerEvent, type WheelEvent } from "react";
import { DEFAULT_WINDOW, panWindow, sampleGraph, validateWindow, zoomWindow, type GraphCurve, type GraphMode, type GraphWindow } from "../lib/graphModel";
import { exportFile } from "../lib/output";
import {graphSegmentsToCsv,nearestGraphTrace,type GraphTrace} from "../lib/graphDataExport";

const WIDTH = 780, HEIGHT = 470;
const COLORS = ["#3269b6", "#c96946", "#27936d", "#9166aa"];
const initial: GraphCurve[] = [{ first: "sin(x)" }, { first: "cos(x)" }];
type DragPoint = { x: number; y: number };

export default function AdvancedGrapher({ onChooseY1 }: { onChooseY1?: (value: string) => void }) {
  const [mode, setMode] = useState<GraphMode>("cartesian");
  const [curves, setCurves] = useState<GraphCurve[]>(initial);
  const [windowRect, setWindowRect] = useState<GraphWindow>(DEFAULT_WINDOW);
  const [parameterMin, setParameterMin] = useState(0);
  const [parameterMax, setParameterMax] = useState(2*Math.PI);
  const [drag, setDrag] = useState<DragPoint | null>(null);
  const [status, setStatus] = useState("");
  const [trace, setTrace] = useState<GraphTrace|null>(null);

  const scaleX = WIDTH / (windowRect.xMax - windowRect.xMin);
  const scaleY = HEIGHT / (windowRect.yMax - windowRect.yMin);
  const xPixel = (x: number) => (x - windowRect.xMin) * scaleX;
  const yPixel = (y: number) => (windowRect.yMax - y) * scaleY;
  const plotted = useMemo(() => curves.map(curve => {
    try {
      return { segments: sampleGraph(curve, mode, windowRect, parameterMin, parameterMax), error: "" };
    } catch (error) {
      return { segments: [] as { x:number;y:number }[][], error: error instanceof Error ? error.message : String(error) };
    }
  }), [curves, mode, windowRect, parameterMin, parameterMax]);

  const segments=useMemo(()=>plotted.map(p=>p.segments),[plotted]);
  async function saveCsv(){
    try{
      const csv=graphSegmentsToCsv(segments,mode);
      const saved=await exportFile("daily-desk-graph-points.csv",csv);
      setStatus(saved?"Saved actual visible-viewport curve samples as CSV; discontinuous segments remain separate.":"Save cancelled.");
    }catch(e){setStatus(e instanceof Error?e.message:String(e));}
  }
  const ticks = (low: number, high: number) => {
    const interval = (high-low)/8;
    return Array.from({length:9}, (_,i) => low+i*interval);
  };
  const toLocal = (event: PointerEvent<SVGSVGElement>): DragPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {x:(event.clientX-bounds.left)*WIDTH/bounds.width, y:(event.clientY-bounds.top)*HEIGHT/bounds.height};
  };
  function move(event: PointerEvent<SVGSVGElement>) {
    if(!drag){
      const pt=toLocal(event);
      setTrace(nearestGraphTrace(segments,windowRect,pt.x,pt.y,WIDTH,HEIGHT));
      return;
    }
    setTrace(null);
    const next = toLocal(event);
    setWindowRect(rect => panWindow(rect, -(next.x-drag.x)/scaleX, (next.y-drag.y)/scaleY));
    setDrag(next);
  }
  function wheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setWindowRect(rect => zoomWindow(rect, event.deltaY > 0 ? 1.15 : 0.86));
  }
  function updateCurve(index:number, field: keyof GraphCurve, value:string) {
    setCurves(items => items.map((item,i) => i===index ? {...item,[field]:value} : item));
  }
  function switchMode(next:GraphMode) {
    setMode(next);
    setTrace(null);
    setWindowRect(DEFAULT_WINDOW);
    setCurves(next==="cartesian" ? initial : next==="polar" ? [{first:"2+sin(5*t)"}] : [{first:"3*cos(t)", second:"2*sin(t)"}]);
  }
  async function saveSvg() {
    try {
      const element = document.getElementById("advanced-graph-svg");
      if (!(element instanceof SVGSVGElement)) throw new Error("Graph is unavailable.");
      const serializer = new XMLSerializer();
      const markup = serializer.serializeToString(element);
      const saved = await exportFile("daily-desk-graph.svg", '<?xml version="1.0" encoding="UTF-8"?>\n' + markup);
      setStatus(saved ? "Graph SVG saved locally." : "Export cancelled.");
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
  }

  return <section className="graph-workbench">
    <h3>Advanced interactive grapher</h3>
    <p className="subtle">Local Cartesian, parametric and polar curves. Drag to pan, scroll or use buttons to zoom. Export an SVG or numerical CSV of the currently sampled graph. Move near a curve for coordinates. The CSV is numerical sampling, not exact symbolic solutions; near discontinuities it may be approximate.</p>
    <div className="pill-row" role="group" aria-label="Graph coordinate mode">
      {(["cartesian","parametric","polar"] as const).map(next =>
        <button key={next} type="button" className={mode===next?"pill active-pill":"pill"} onClick={()=>switchMode(next)}>{next==="cartesian"?"Y(x)":next==="parametric"?"Parametric x(t),y(t)":"Polar r(θ)"}</button>
      )}
    </div>
    <div className="graph-equations">
      {curves.map((curve,i) => <div className="graph-equation-row" key={i}>
        <span aria-hidden="true" className="graph-color-marker" style={{background:COLORS[i]}}/>
        <label className="field-label">{mode==="cartesian" ? `Y${i+1} =` : mode==="polar" ? `r${i+1}(θ) =` : `x${i+1}(t) =`}
          <input className="field" value={curve.first} onChange={e=>updateCurve(i,"first",e.target.value)} maxLength={160}/>
        </label>
        {mode==="parametric"&&<label className="field-label">y{i+1}(t) = <input className="field" value={curve.second??""} maxLength={160} onChange={e=>updateCurve(i,"second",e.target.value)}/></label>}
        <button type="button" className="icon-button" aria-label={"Remove curve "+(i+1)} onClick={()=>setCurves(items=>items.filter((_,j)=>j!==i))}>×</button>
      </div>)}
      <div className="actions">
        <button className="secondary-button" type="button" disabled={curves.length>=4} onClick={()=>setCurves(items=>[...items,mode==="cartesian"?{first:"x^2"}:mode==="polar"?{first:"1+cos(3*t)"}:{first:"cos(2*t)",second:"sin(t)"}])}>Add curve</button>
        {mode==="cartesian"&&<button type="button" className="secondary-button" disabled={!curves[0]} onClick={()=>onChooseY1?.(curves[0].first)}>Use Y1 in calculus</button>}
      </div>
    </div>
    {mode!=="cartesian"&&<div className="tools-pair">
      <label className="field-label">Parameter from <input className="field" type="number" value={parameterMin} onChange={e=>setParameterMin(Number(e.target.value))}/></label>
      <label className="field-label">Parameter to <input className="field" type="number" value={parameterMax} onChange={e=>setParameterMax(Number(e.target.value))}/></label>
    </div>}
    <div className="actions">
      <button type="button" className="secondary-button" onClick={()=>setWindowRect(r=>zoomWindow(r,.75))}>Zoom +</button>
      <button type="button" className="secondary-button" onClick={()=>setWindowRect(r=>zoomWindow(r,1.35))}>Zoom −</button>
      <button type="button" className="secondary-button" onClick={()=>setWindowRect(DEFAULT_WINDOW)}>Reset view</button>
      <button type="button" className="secondary-button" onClick={()=>{void saveSvg();}}>Export SVG</button>
      <button type="button" className="secondary-button" data-testid="graph-export-csv" onClick={()=>{void saveCsv();}}>Export points CSV</button>
    </div>
    <svg id="advanced-graph-svg" xmlns="http://www.w3.org/2000/svg" className="math-graph advanced-graph" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img" aria-label="Interactive mathematical graph" onWheel={wheel}
      onPointerDown={e=>{setDrag(toLocal(e));e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={move} onPointerLeave={()=>{if(!drag)setTrace(null);}}
      onPointerUp={e=>{setDrag(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>setDrag(null)} onDoubleClick={()=>setWindowRect(DEFAULT_WINDOW)}
      style={{touchAction:"none",cursor:drag?"grabbing":"grab"}}>
      <rect width={WIDTH} height={HEIGHT} fill="#ffffff"/>
      <defs><clipPath id="advanced-clip"><rect x="0" y="0" width={WIDTH} height={HEIGHT}/></clipPath></defs>
      {ticks(windowRect.xMin,windowRect.xMax).map((value,i)=><g key={"x"+i}>
        <line x1={xPixel(value)} y1="0" x2={xPixel(value)} y2={HEIGHT} stroke="#ebeff4"/>
        <text x={xPixel(value)+3} y={HEIGHT-7} fill="#8a99ae" fontSize="12">{Number(value.toPrecision(3))}</text>
      </g>)}
      {ticks(windowRect.yMin,windowRect.yMax).map((value,i)=><g key={"y"+i}>
        <line x1="0" y1={yPixel(value)} x2={WIDTH} y2={yPixel(value)} stroke="#ebeff4"/>
        <text x="6" y={yPixel(value)-4} fill="#8a99ae" fontSize="12">{Number(value.toPrecision(3))}</text>
      </g>)}
      {windowRect.xMin<=0&&windowRect.xMax>=0&&<line x1={xPixel(0)} y1="0" x2={xPixel(0)} y2={HEIGHT} stroke="#8899ad" strokeWidth="1.5"/>}
      {windowRect.yMin<=0&&windowRect.yMax>=0&&<line x1="0" y1={yPixel(0)} x2={WIDTH} y2={yPixel(0)} stroke="#8899ad" strokeWidth="1.5"/>}
      <g clipPath="url(#advanced-clip)">
        {plotted.map((curve,i)=>curve.segments.map((part,j)=><polyline key={i+"-"+j}
          points={part.map(p=>`${xPixel(p.x)},${yPixel(p.y)}`).join(" ")}
          fill="none" stroke={COLORS[i]} strokeWidth={2.5} strokeLinejoin="round"/>))}
      </g>
      {trace&&<g data-testid="graph-trace-point" pointerEvents="none">
        <circle cx={xPixel(trace.point.x)} cy={yPixel(trace.point.y)} r="6" fill="#fff" stroke={COLORS[(trace.curve-1)%COLORS.length]} strokeWidth="2.5"/>
      </g>}
    </svg>
    <p className="subtle" data-testid="graph-trace-reading" role="status">{trace?
      `Curve ${trace.curve} · x=${Number(trace.point.x.toPrecision(10))} · y=${Number(trace.point.y.toPrecision(10))}`:
      "Move near a plotted curve to read its numerical coordinates."}</p>
    <div className="graph-equations">
      {plotted.map((curve,i)=>curve.error&&<p className="subtle" role="status" key={i}>Curve {i+1}: {curve.error}</p>)}
      <p className="subtle">Window: x [{windowRect.xMin.toFixed(2)}, {windowRect.xMax.toFixed(2)}], y [{windowRect.yMin.toFixed(2)}, {windowRect.yMax.toFixed(2)}].</p>
    </div>
    {status&&<p className="subtle" role="status">{status}</p>}
  </section>;
}
