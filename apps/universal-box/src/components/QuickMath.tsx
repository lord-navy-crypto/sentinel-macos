import {useState} from "react";
import {functionTable} from "../lib/functionTableExport";
import {exportFile} from "../lib/output";
import {baseConvert,quadraticRoots,descriptiveStats,twoByTwo} from "../lib/quickMath";

type Mode = "base"|"equation"|"stats"|"matrix"|"table";
export default function QuickMath(){
  const [mode,setMode]=useState<Mode>("base");
  const [value,setValue]=useState("FF");
  const [from,setFrom]=useState(16),[to,setTo]=useState(10);
  const [a,setA]=useState(1),[b,setB]=useState(-3),[c,setC]=useState(2);
  const [d,setD]=useState(-1),[e,setE]=useState(5),[f,setF]=useState(1);
  const [data,setData]=useState("1,2,3,4,5");
  const [tableExpr,setTableExpr]=useState("x^2");
  const [start,setStart]=useState(-5),[step,setStep]=useState(1),[count,setCount]=useState(11);
  const [result,setResult]=useState("");
  const [tableCsv,setTableCsv]=useState("");
  const [tableStatus,setTableStatus]=useState("");
  function calc(){
    setTableCsv("");setTableStatus("");
    try{
      if(mode==="base")setResult(baseConvert(value,from,to));
      if(mode==="equation")setResult(quadraticRoots(a,b,c).map((x,i)=>"x"+(i+1)+" = "+x).join("\n"));
      if(mode==="stats") {
        const s=descriptiveStats(data.split(/[\s,;]+/u).filter(Boolean).map(Number));
        setResult(`n = ${s.n}\nMean = ${s.mean}\nMedian = ${s.median}\nMin = ${s.min}\nMax = ${s.max}\nSample SD = ${s.sampleSd??"not defined"}\nPopulation SD = ${s.populationSd}`);
      }
      if(mode==="matrix"){
        const s=twoByTwo(a,b,c,d,e,f);
        setResult(`x = ${s.x}\ny = ${s.y}\nDeterminant = ${s.det}`);
      }
      if(mode==="table"){
        const table=functionTable(tableExpr,start,step,count);
        setTableCsv(table.csv);
        setResult(table.display);
      }
    }catch(error){setResult("Error: "+String(error instanceof Error?error.message:error));}
  }
  return <section className="quick-math">
    <h3>Calculator extras · local</h3>
    <p className="subtle">Fast classroom conversions, quadratic equations, basic statistics, and two simultaneous equations.</p>
    <div className="pill-row" role="group" aria-label="Calculator extras">
      {([["base","BASE-N"],["equation","Quadratic"],["stats","1-var STAT"],["matrix","2×2 equations"],["table","Function table"]] as const).map(([id,label])=>
      <button key={id} className={mode===id?"pill active-pill":"pill"} onClick={()=>{setMode(id);setResult("");setTableCsv("");setTableStatus("");}} type="button">{label}</button>)}
    </div>
    {mode==="base"&&<div className="tools-pair">
      <label className="field-label">Integer<input className="field" value={value} onChange={ev=>setValue(ev.target.value)} maxLength={40}/></label>
      <label className="field-label">From base<input className="field" type="number" min={2} max={36} value={from} onChange={ev=>setFrom(Number(ev.target.value))}/></label>
      <label className="field-label">To base<input className="field" type="number" min={2} max={36} value={to} onChange={ev=>setTo(Number(ev.target.value))}/></label>
    </div>}
    {mode==="equation"&&<>
      <p className="subtle">Solve ax² + bx + c = 0</p>
      <div className="tools-pair">{(["a","b","c"] as const).map((key,i)=>{
        const n=[a,b,c][i],handler=[setA,setB,setC][i];
        return <label key={key} className="field-label">{key}<input className="field" type="number" value={n} onChange={ev=>handler(Number(ev.target.value))}/></label>;
      })}</div>
    </>}
    {mode==="table"&&<div className="tools-pair">
      <label className="field-label">f(x) <input className="field" value={tableExpr} onChange={event=>{setTableExpr(event.target.value);setTableCsv("");}}/></label>
      <label className="field-label">Start x <input className="field" type="number" value={start} onChange={event=>{setStart(Number(event.target.value));setTableCsv("");}}/></label>
      <label className="field-label">Step <input className="field" type="number" value={step} onChange={event=>{setStep(Number(event.target.value));setTableCsv("");}}/></label>
      <label className="field-label">Rows (2–50) <input className="field" type="number" min={2} max={50} value={count} onChange={event=>{setCount(Number(event.target.value));setTableCsv("");}}/></label>
    </div>}
    {mode==="stats"&&<><label className="field-label">Numbers (comma or whitespace-separated)</label>
      <textarea className="field text-editor" rows={5} value={data} onChange={ev=>setData(ev.target.value)} /></>}
    {mode==="matrix"&&<>
      <p className="subtle">Solve ax + by = e and cx + dy = f</p>
      <div className="tools-pair">{([["a",a,setA],["b",b,setB],["c",c,setC],["d",d,setD],["e",e,setE],["f",f,setF]] as const).map(([label,n,set])=>
        <label key={label} className="field-label">{label}<input className="field" type="number" value={n} onChange={ev=>set(Number(ev.target.value))}/></label>)}</div>
    </>}
    <button className="primary-button" type="button" onClick={calc}>Calculate</button>
    {mode==="table"&&<button className="secondary-button" type="button" data-testid="function-table-export"
     disabled={!tableCsv} onClick={()=>{void exportFile("daily-desk-function-table.csv",tableCsv)
      .then(saved=>setTableStatus(saved?"Saved calculated numerical table as CSV.":"Save cancelled."))
      .catch(e=>setTableStatus(String(e instanceof Error?e.message:e)));}}>Save table CSV</button>}
    {result&&<pre className="analysis-result" role="status">{result}</pre>}
    {tableStatus&&<p className="subtle" role="status">{tableStatus}</p>}
  </section>;
}
