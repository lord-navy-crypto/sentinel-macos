import {type ChangeEvent,useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {chartModel,chartSvg,scatterChartModel,scatterChartSvg,scatterChartCsv,parseChartCsv,type ChartKind,type ChartAggregate} from "../lib/chartViz";
import {tableToCsv} from "../lib/tableTools";
import {fitScatterLine,formatRegressionNumber} from "../lib/scatterRegression";
import {analyzeFitResiduals,residualAnalysisCsv,residualScatterChart} from "../lib/scatterResiduals";
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
const SAMPLE="Month,Revenue,Orders\nJanuary,1420,24\nFebruary,1890,30\nMarch,1640,26\nApril,2180,38\nMay,2330,41\nJune,2710,48";
export default function ChartDesk(){
 const [source,setSource]=useState(SAMPLE);
 const [category,setCategory]=useState(0),[value,setValue]=useState(1);
 const [kind,setKind]=useState<ChartKind|"scatter">("bar"),[aggregate,setAggregate]=useState<ChartAggregate>("sum");
 const [title,setTitle]=useState("Monthly revenue"),[unit,setUnit]=useState("USD");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [showFit,setShowFit]=useState(false);
 const [showResiduals,setShowResiduals]=useState(false);
 const parsed=useMemo(()=>{
   try{return {table:parseChartCsv(source),error:""};}
   catch(e){return {table:null,error:errorMessage(e)};}
 },[source]);
 const visualization=useMemo(()=>{
   if(!parsed.table)return {data:null,svg:"",error:parsed.error,fit:null};
   try{
     const data=kind==="scatter"?
       scatterChartModel(parsed.table,category,value,title,unit):
       chartModel(parsed.table,category,value,aggregate,kind,title,unit);
     const fit=data.kind==="scatter"&&showFit?fitScatterLine(data.points):null;
     const svg=data.kind==="scatter"?scatterChartSvg(data,fit):chartSvg(data);
     return {data,svg,error:"",fit};
   }catch(e){return {data:null,svg:"",error:errorMessage(e),fit:null};}
 },[parsed,category,value,aggregate,kind,title,unit,showFit]);
 const residuals=useMemo(()=>{
   const data=visualization.data,fit=visualization.fit;
   if(kind!=="scatter"||!showFit||!showResiduals||!data||data.kind!=="scatter"||!fit)
     return {summary:null,svg:"",error:""};
   try{
     const summary=analyzeFitResiduals(data.points,fit);
     const chart=residualScatterChart(data,summary);
     return {summary,svg:scatterChartSvg(chart,null,true),error:""};
   }catch(e){return {summary:null,svg:"",error:errorMessage(e)};}
 },[kind,showFit,showResiduals,visualization]);
 async function choose(event:ChangeEvent<HTMLInputElement>){
   const file=event.target.files?.[0];event.target.value="";if(!file)return;
   setStatus("");
   setBusy(true);
   try{
     if(!/\.csv$/iu.test(file.name)||file.size>120_000)
       throw Error("Choose a .csv file within 120 KB.");
     const incoming=await file.text();
     parseChartCsv(incoming);setSource(incoming);setCategory(0);setValue(1);
     setStatus("Imported local CSV. No upload.");
   }catch(e){setStatus("Import failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function saveResidual(format:"csv"|"svg"){
   const data=visualization.data;
   if(kind!=="scatter"||!data||data.kind!=="scatter"||!residuals.summary||
      !residuals.svg||busy)return;
   setBusy(true);setStatus("");
   try{
     const bytes=format==="csv"?residualAnalysisCsv(data,residuals.summary):residuals.svg;
     const name=format==="csv"?"universal-box-fit-residuals.csv":"universal-box-fit-residuals.svg";
     const saved=await exportFile(name,bytes);
     setStatus(saved?"Saved actual observed/predicted/residual values locally.":"Save cancelled.");
   }catch(e){setStatus("Residual export failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function saveFitReport(){
   if(kind!=="scatter"||!visualization.fit||busy)return;
   const fit=visualization.fit;
   const report=[
     "Sentinel Box · Scientific Scatter Linear Regression",
     "Method: ordinary least squares (unweighted); descriptive, not causal",
     "Equation: y = slope * x + intercept",
     "Slope: "+String(fit.slope),
     "Intercept: "+String(fit.intercept),
     "R squared: "+(fit.rSquared===null?"undefined (constant Y)":String(fit.rSquared)),
     "Observations: "+fit.observations,
     "X range: "+fit.xMin+" to "+fit.xMax,
     "Values use double-precision arithmetic. Repeated X measurements are preserved.",
   ].join("\n")+"\n";
   setBusy(true);setStatus("");
   try{
     const saved=await exportFile("universal-box-linear-fit.txt",report);
     setStatus(saved?"Saved fitted numerical parameters as TXT.":"Save cancelled.");
   }catch(e){setStatus("Regression export failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function saveSvg(){
   if(!visualization.svg||busy)return;
   setBusy(true);setStatus("");
   try{
     const saved=await exportFile("universal-box-data-chart.svg",visualization.svg);
     setStatus(saved?"Saved scalable SVG to your chosen location.":"Save cancelled.");
   }catch(e){setStatus("Save failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function saveSummary(){
   if(!visualization.data||busy)return;
   setBusy(true);setStatus("");
   try{
     const data=visualization.data;
     const csv=data.kind==="scatter"?
       scatterChartCsv(data):
       tableToCsv({headers:["Category","Value","Source records"],
         rows:data.points.map(p=>[p.label,String(p.value),String(p.items)])});
     const saved=await exportFile("universal-box-chart-data.csv",csv);
     setStatus(saved?(data.kind==="scatter"?
       "Saved verified raw X/Y observations as CSV.":"Saved chart's aggregated dataset as CSV."):"Save cancelled.");
   }catch(e){setStatus("Data export failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 return <section className="panel charts-workbench">
   <p className="eyebrow">SENTINEL BOX · DATA VISUALIZATION</p>
   <h2>Data Chart Studio / 数据可视化</h2>
   <p className="subtle">Turn a small CSV into an offline bar, category-line or true scientific XY scatter chart. Scatter respects the original X/Y numeric coordinates and row order without aggregating observations. Export scalable SVG or the chart data as CSV. No servers, paid chart services or tracking.</p>
   <div className="chart-controls">
     <div className="chart-control-main">
       <label className="field-label" htmlFor="chart-import">Load CSV (≤120 KB)</label>
       <input className="field" type="file" id="chart-import" accept=".csv,text/csv" onChange={e=>{void choose(e);}}/>
       <label className="field-label" htmlFor="chart-csv">Or edit the table directly</label>
       <textarea className="field text-editor" id="chart-csv" value={source} onChange={e=>{setSource(e.target.value);setStatus("");}} rows={9} maxLength={120000}/>
     </div>
     <div className="chart-settings">
       <label className="field-label">Chart title
         <input className="field" maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}/>
       </label>
       <label className="field-label">{kind==="scatter"?"X numeric column":"Category column"}
         <select className="field" data-testid="chart-x-column" value={category} onChange={e=>setCategory(Number(e.target.value))} disabled={!parsed.table}>
           {parsed.table?.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}
         </select>
       </label>
       <label className="field-label">{kind==="scatter"?"Y numeric column":"Value column"}
         <select className="field" data-testid="chart-y-column" value={value} onChange={e=>setValue(Number(e.target.value))} disabled={!parsed.table}>
           {parsed.table?.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}
         </select>
       </label>
       <label className="field-label">Aggregation
         <select className="field" value={aggregate} disabled={kind==="scatter"} onChange={e=>setAggregate(e.target.value as ChartAggregate)}>
           <option value="sum">Sum values</option><option value="average">Average value</option><option value="count">Count records</option>
         </select>
       </label>
       <label className="field-label">Visual style
         <select className="field" data-testid="chart-kind" value={kind} onChange={e=>setKind(e.target.value as ChartKind|"scatter")}>
           <option value="bar">Vertical bars</option><option value="line">Connected category line</option>
           <option value="scatter">Scientific XY scatter (numeric axes)</option>
         </select>
       </label>
       {kind==="scatter"&&<label className="field-label">
         <input type="checkbox" data-testid="chart-show-fit" checked={showFit}
          onChange={e=>{setShowFit(e.target.checked);if(!e.target.checked)setShowResiduals(false);}}/>
         Show ordinary least-squares trendline
       </label>}
       {kind==="scatter"&&showFit&&<label className="field-label">
         <input type="checkbox" data-testid="chart-show-residuals" checked={showResiduals}
          onChange={e=>setShowResiduals(e.target.checked)}/>
         Show residual diagnostics (observed − fitted)
       </label>}
       <label className="field-label">Unit (optional)
         <input className="field" maxLength={18} value={unit} onChange={e=>setUnit(e.target.value)}/>
       </label>
     </div>
   </div>
   {visualization.error?<p className="subtle" role="alert">{visualization.error}</p>:visualization.data&&<>
     <div className="chart-stat-strip" aria-label="Chart statistics">
       <div><span>{kind==="scatter"?"Observations":"Categories"}</span><strong>{visualization.data.points.length}</strong></div>
       <div><span>Minimum</span><strong>{visualization.data.minimum.toLocaleString()}</strong></div>
       <div><span>Maximum</span><strong>{visualization.data.maximum.toLocaleString()}</strong></div>
     </div>
     {kind==="scatter"&&showFit&&<div className="panel" data-testid="chart-fit-details">
       {visualization.fit?<>
         <p><strong>Least-squares fit:</strong> y = ({formatRegressionNumber(visualization.fit.slope)})x
          + ({formatRegressionNumber(visualization.fit.intercept)})</p>
         <p data-testid="chart-fit-r2">R² = {visualization.fit.rSquared===null?
           "undefined for constant Y":formatRegressionNumber(visualization.fit.rSquared)}
           {" · "}n = {visualization.fit.observations}</p>
         <p className="subtle">Dashed orange line. Unweighted numerical regression; not proof of causation.
           R² describes fit quality only and does not quantify experimental uncertainty.</p>
       </>:<p role="status" className="subtle">Linear fit unavailable: provide at least two observations with distinct X coordinates.</p>}
     </div>}
     <div className="chart-preview-frame" data-testid="chart-preview-frame">
       <img data-testid="chart-preview-image" alt={"Chart titled "+(title||"Offline data chart")+" with "+visualization.data.points.length+" categories"}
         src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(visualization.svg)}/>
     </div>
     {kind==="scatter"&&showFit&&showResiduals&&visualization.fit&&
      (residuals.error?<p role="alert" className="subtle">{residuals.error}</p>:
       residuals.summary&&<section className="panel" data-testid="chart-residuals">
         <h3>Regression residuals · 回归残差</h3>
         <p className="subtle">RMSE = {formatRegressionNumber(residuals.summary.rmse)}
           {" · "}SSE = {formatRegressionNumber(residuals.summary.sse)}
           {" · "}maximum |residual| = {formatRegressionNumber(residuals.summary.maxAbsoluteResidual)}
         </p>
         <p className="subtle">Residual = observed Y − fitted Y. Red dashed zero baseline;
           values above zero are higher than the fit. These diagnostics are descriptive, not measurement error bars.</p>
         <div className="chart-preview-frame">
           <img data-testid="chart-residual-preview-image"
            alt={"Residuals of "+(title||"scientific scatter")+" with "+residuals.summary.records.length+" measurements"}
            src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(residuals.svg)}/>
         </div>
         <div className="actions">
           <button type="button" className="secondary-button" data-testid="chart-export-residual-csv"
            disabled={busy} onClick={()=>{void saveResidual("csv");}}>Export residual CSV</button>
           <button type="button" className="secondary-button" data-testid="chart-export-residual-svg"
            disabled={busy} onClick={()=>{void saveResidual("svg");}}>Export residual SVG</button>
         </div>
       </section>)}
     <p className="subtle">{kind==="scatter"?
       "Scientific scatter: 1–250 finite decimal XY observations, ±1e12 range; missing pairs skipped, partially missing rows rejected. Original decimal strings (including trailing zeroes) are retained in exported CSV. Repeated X values are separate points. Optional least-squares fit and residuals use double-precision values, not a causal model or experimental error estimates.":
       "Category charts: blank numeric values are ignored for sum/average. Maximum 24 categories. Aggregated values are not necessarily the original rows."} SVG contains no executable scripts.</p>
     <div className="actions">
       <button className="primary-button" type="button" data-testid="chart-save-svg" disabled={busy} onClick={()=>{void saveSvg();}}>Export chart SVG</button>
       <button className="secondary-button" type="button" data-testid="chart-save-csv" disabled={busy} onClick={()=>{void saveSummary();}}>{kind==="scatter"?"Export XY source CSV":"Export aggregated CSV"}</button>
       {kind==="scatter"&&showFit&&<button className="secondary-button" type="button"
        data-testid="chart-export-fit" disabled={busy||!visualization.fit}
        onClick={()=>{void saveFitReport();}}>Export regression TXT</button>}
     </div>
   </>}
   {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}
