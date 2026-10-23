import { useMemo, useState } from "react";
import { calculateExpression,appendCalculation,calculatorHistoryText,type Calculation } from "../lib/calculatorSession";
import {exportFile} from "../lib/output";
import AdvancedGrapher from "./AdvancedGrapher";
import QuickMath from "./QuickMath";
import ClassWizDesk from "./ClassWizDesk";
import FormulaBoardDesk from "./FormulaBoardDesk";
import UnitsDesk from "./UnitsDesk";
import katex from "katex";
import NumericalWorkbench from "./NumericalWorkbench";
import { combineVectors, significantFigures, roundSignificant } from "../lib/mathExtras";
import "katex/dist/katex.min.css";

export type MathTab = "classwiz" | "extras" | "calculator" | "graph" | "calculus" | "units" | "notation" | "vector" | "formula" | "latex";
export default function MathDesk({initialTab="calculator"}:{initialTab?:MathTab}){
  const [tab,setTab]=useState<MathTab>(initialTab);
  const [expression,setExpression]=useState("sin(pi/2) + sqrt(16)");
  const [result,setResult]=useState("");
  const [answer,setAnswer]=useState<number|null>(null);
  const [calcHistory,setCalcHistory]=useState<Calculation[]>([]);
  const [plot,setPlot]=useState(["sin(x)","cos(x)"]);
  const [notation,setNotation]=useState("12345.678");
  const [otherNumber,setOtherNumber]=useState("2.1");
  const [sigDigits,setSigDigits]=useState(3);
  const [sigOperation,setSigOperation]=useState<"multiply"|"divide">("multiply");
  const [magnitude,setMagnitude]=useState(10);
  const [angle,setAngle]=useState(30);
  const [magnitudeB,setMagnitudeB]=useState(5);
  const [angleB,setAngleB]=useState(120);
  const [vectorOperation,setVectorOperation]=useState<"add"|"subtract">("add");
  const [latex,setLatex]=useState("E=mc^2");
  const [status,setStatus]=useState("");
  function runCalculation(){
    try{
      const value=calculateExpression(expression,answer);
      setResult(value.result);
      setAnswer(value.numericAns);
      setCalcHistory(previous=>appendCalculation(previous,{expression:expression.trim(),result:value.result}));
      setStatus("");
    }catch(e){
      setResult("");
      setStatus(e instanceof Error?e.message:String(e));
    }
  }
  async function copyCalculation(){
    if(!result)return;
    try{
      await navigator.clipboard.writeText(result);
      setStatus("Copied calculated result as plain text.");
    }catch{
      setStatus("Clipboard unavailable; select the result and copy manually.");
    }
  }
  async function saveCalculations(){
    try{
      const saved=await exportFile("sentinel-calculator-history.txt",calculatorHistoryText(calcHistory));
      setStatus(saved?"Saved local calculator history as TXT.":"Save cancelled.");
    }catch(e){setStatus(e instanceof Error?e.message:String(e));}
  }
  const formatted=useMemo(()=>{const n=Number(notation);return Number.isFinite(n)?n.toExponential(5):"Not a number";},[notation]);
  const sigCount=significantFigures(notation);
  const sigCountB=significantFigures(otherNumber);
  const arithmetic=Number(notation) * (sigOperation==="multiply" ? Number(otherNumber) : 1);
  const preciseResult=sigOperation==="divide" ? Number(notation)/Number(otherNumber) : arithmetic;
  let sigResult="Enter valid nonzero numbers";
  try { if(Number.isFinite(preciseResult)) sigResult=roundSignificant(preciseResult,sigDigits); } catch { /* invalid input shown above */ }
  const vectorResult=combineVectors({magnitude,angle},{magnitude:magnitudeB,angle:angleB},vectorOperation==="subtract");
  const mathHtml=useMemo(()=>{try{return katex.renderToString(latex,{throwOnError:false,trust:false,output:"html"})}catch{return ""}},[latex]);

  return <section className="panel">
    <p className="eyebrow">MATH WORKBENCH · LOCAL CALCULATIONS</p><h2>Math & science utilities</h2>
    <p className="subtle">Calculator, advanced complex/matrix/statistics/distribution modes, graphs, units, vectors, scientific notation, formulas and LaTeX. Calculation runs locally; the graph preview is a simpler subset of the website's advanced grapher.</p>
    <div className="pill-row" role="group" aria-label="Math tool">{(["calculator","classwiz","graph","calculus","extras","units","notation","vector","formula","latex"] as const).map(k=><button className={tab===k?"pill active-pill":"pill"} key={k} onClick={()=>{setTab(k);setStatus("");}} type="button">{k[0].toUpperCase()+k.slice(1)}</button>)}</div>
    {tab==="calculator"&&<>
      <label htmlFor="calc-expression" className="field-label">Expression · sin, cos, sqrt, log, pi, matrices</label>
      <input className="field" style={{width:"100%"}} id="calc-expression" maxLength={180}
        value={expression} onChange={e=>{setExpression(e.target.value);setResult("");setStatus("");}}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();runCalculation();}}}/>
      <p className="subtle">Enter to calculate; functions use radians. Ans is your most recent finite real numeric result. History is session-only and is not automatically saved.</p>
      <div className="actions">
        <button className="primary-button" type="button" data-testid="calculator-compute" onClick={runCalculation}>Calculate</button>
        <button className="secondary-button" type="button" data-testid="calculator-insert-ans" disabled={answer===null}
          onClick={()=>{setExpression(v=>v+"Ans");setResult("");}}>Insert Ans</button>
        <button className="secondary-button" type="button" data-testid="calculator-copy" disabled={!result}
          onClick={()=>{void copyCalculation();}}>Copy result</button>
      </div>
      {result&&<p className="stat-pill" role="status" data-testid="calculator-result">{result}</p>}
      {answer!==null&&<p className="subtle" data-testid="calculator-ans">Ans = {String(answer)}</p>}
      <div className="actions">
        <button type="button" className="secondary-button" data-testid="calculator-save-history"
          disabled={!calcHistory.length} onClick={()=>{void saveCalculations();}}>Save history TXT</button>
        <button type="button" className="secondary-button" data-testid="calculator-clear-history"
          disabled={!calcHistory.length}
          onClick={()=>{if(window.confirm("Clear the calculation history and Ans?")){
            setCalcHistory([]);setAnswer(null);setResult("");setStatus("Calculator history cleared.");
          }}}>Clear history</button>
      </div>
      {calcHistory.length>0&&<div className="panel" data-testid="calculator-history">
        <p className="subtle">Latest calculations · click a row to reuse its original expression (up to 20 entries).</p>
        {calcHistory.slice().reverse().map((item,i)=><button type="button" className="secondary-button"
          key={i} data-testid="calculator-reuse" style={{display:"block",maxWidth:"100%",marginBottom:6,textAlign:"left",overflowWrap:"anywhere"}}
          onClick={()=>{setExpression(item.expression);setResult("");setStatus("Loaded expression. Calculate to refresh the result.");}}>
          {item.expression} = {item.result}
        </button>)}
      </div>}
    </>}
    {tab==="graph"&&<AdvancedGrapher onChooseY1={expr=>{setPlot([expr]);setTab("calculus");}}/>}
    {tab==="calculus"&&<NumericalWorkbench initialFunction={plot[0]??"x"}/>}
    {tab==="classwiz"&&<ClassWizDesk/>}
    {tab==="extras"&&<QuickMath/>}
    {tab==="units"&&<UnitsDesk onInsert={value=>{setExpression(value);setTab("calculator");}} />}
    {tab==="notation"&&<>
      <label className="field-label" htmlFor="notation-number">First number (as written)</label>
      <input id="notation-number" className="field" value={notation} onChange={e=>setNotation(e.target.value)}/>
      <div className="metrics"><span>Scientific notation: {formatted}</span><span>Estimated significant figures: {sigCount??"invalid"}</span></div>
      <div className="tools-pair">
        <label className="field-label">Second number <input className="field" value={otherNumber} onChange={e=>setOtherNumber(e.target.value)}/></label>
        <label className="field-label">Operation <select className="field" value={sigOperation} onChange={e=>setSigOperation(e.target.value as "multiply"|"divide")}><option value="multiply">Multiply</option><option value="divide">Divide</option></select></label>
        <label className="field-label">Result significant figures <input className="field" type="number" min={1} max={15} value={sigDigits} onChange={e=>setSigDigits(Math.max(1,Math.min(15,Number(e.target.value)||1)))}/></label>
      </div>
      <p className="stat-pill">Rounded result: {sigResult}</p>
      <p className="subtle">Second input has {sigCountB??"unknown"} significant figures. The count of terminal zeros in an integer without a decimal point is ambiguous. Choose the result precision deliberately.</p>
    </>}
    {tab==="vector"&&<>
      <div className="tools-pair">
        <label className="field-label">Vector A magnitude <input className="field" type="number" value={magnitude} onChange={e=>setMagnitude(Number(e.target.value))}/></label>
        <label className="field-label">Vector A angle (°) <input className="field" type="number" value={angle} onChange={e=>setAngle(Number(e.target.value))}/></label>
        <label className="field-label">Vector B magnitude <input className="field" type="number" value={magnitudeB} onChange={e=>setMagnitudeB(Number(e.target.value))}/></label>
        <label className="field-label">Vector B angle (°) <input className="field" type="number" value={angleB} onChange={e=>setAngleB(Number(e.target.value))}/></label>
      </div>
      <label className="field-label">Combine vectors <select className="field" value={vectorOperation} onChange={e=>setVectorOperation(e.target.value as "add"|"subtract")}><option value="add">A + B</option><option value="subtract">A − B</option></select></label>
      <div className="metrics"><span>Rx = {vectorResult.x.toFixed(5)}</span><span>Ry = {vectorResult.y.toFixed(5)}</span><span>|R| = {vectorResult.magnitude.toFixed(5)}</span><span>θ = {vectorResult.angle.toFixed(3)}°</span></div>
    </>}
    {tab==="formula"&&<FormulaBoardDesk/>}
    {tab==="latex"&&<>
      <label className="field-label" htmlFor="latex-input">LaTeX input</label><textarea className="field" rows={5} id="latex-input" value={latex} onChange={e=>setLatex(e.target.value)}/>
      <div className="math-formula math-preview" dangerouslySetInnerHTML={{__html:mathHtml}}/>
    </>}
    {status&&<p className="subtle" role="status">{status}</p>}
  </section>;
}
