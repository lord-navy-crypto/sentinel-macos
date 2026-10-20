import {type ChangeEvent,useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {chartModel,chartSvg,parseChartCsv,type ChartKind,type ChartAggregate} from "../lib/chartViz";
import {tableToCsv} from "../lib/tableTools";
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
const SAMPLE="Month,Revenue,Orders\nJanuary,1420,24\nFebruary,1890,30\nMarch,1640,26\nApril,2180,38\nMay,2330,41\nJune,2710,48";
export default function ChartDesk(){
 const [source,setSource]=useState(SAMPLE);
 const [category,setCategory]=useState(0),[value,setValue]=useState(1);
 const [kind,setKind]=useState<ChartKind>("bar"),[aggregate,setAggregate]=useState<ChartAggregate>("sum");
 const [title,setTitle]=useState("Monthly revenue"),[unit,setUnit]=useState("USD");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const parsed=useMemo(()=>{
   try{return {table:parseChartCsv(source),error:""};}
   catch(e){return {table:null,error:errorMessage(e)};}
 },[source]);
 const visualization=useMemo(()=>{
   if(!parsed.table)return {data:null,svg:"",error:parsed.error};
   try{
     const data=chartModel(parsed.table,category,value,aggregate,kind,title,unit);
     return {data,svg:chartSvg(data),error:""};
   }catch(e){return {data:null,svg:"",error:errorMessage(e)};}
 },[parsed,category,value,aggregate,kind,title,unit]);
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
     const csv=tableToCsv({headers:["Category","Value","Source records"],rows:visualization.data.points
       .map(p=>[p.label,String(p.value),String(p.items)])});
     const saved=await exportFile("universal-box-chart-data.csv",csv);
     setStatus(saved?"Saved chart's aggregated dataset as CSV.":"Save cancelled.");
   }catch(e){setStatus("Data export failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 return <section className="panel charts-workbench">
   <p className="eyebrow">UNIVERSAL BOX · DATA VISUALIZATION</p>
   <h2>Data Chart Studio / 数据可视化</h2>
   <p className="subtle">Turn a small CSV into an offline chart. Choose grouping, numeric values, aggregation and visual style, then export vector SVG or the chart's CSV summary. No servers, paid chart services or tracking.</p>
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
       <label className="field-label">Category column
         <select className="field" value={category} onChange={e=>setCategory(Number(e.target.value))} disabled={!parsed.table}>
           {parsed.table?.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}
         </select>
       </label>
       <label className="field-label">Value column
         <select className="field" value={value} onChange={e=>setValue(Number(e.target.value))} disabled={!parsed.table}>
           {parsed.table?.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}
         </select>
       </label>
       <label className="field-label">Aggregation
         <select className="field" value={aggregate} onChange={e=>setAggregate(e.target.value as ChartAggregate)}>
           <option value="sum">Sum values</option><option value="average">Average value</option><option value="count">Count records</option>
         </select>
       </label>
       <label className="field-label">Visual style
         <select className="field" value={kind} onChange={e=>setKind(e.target.value as ChartKind)}>
           <option value="bar">Vertical bars</option><option value="line">Connected line</option>
         </select>
       </label>
       <label className="field-label">Unit (optional)
         <input className="field" maxLength={18} value={unit} onChange={e=>setUnit(e.target.value)}/>
       </label>
     </div>
   </div>
   {visualization.error?<p className="subtle" role="alert">{visualization.error}</p>:visualization.data&&<>
     <div className="chart-stat-strip" aria-label="Chart statistics">
       <div><span>Categories</span><strong>{visualization.data.points.length}</strong></div>
       <div><span>Minimum</span><strong>{visualization.data.minimum.toLocaleString()}</strong></div>
       <div><span>Maximum</span><strong>{visualization.data.maximum.toLocaleString()}</strong></div>
     </div>
     <div className="chart-preview-frame">
       <img alt={"Chart titled "+(title||"Offline data chart")+" with "+visualization.data.points.length+" categories"}
         src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(visualization.svg)}/>
     </div>
     <p className="subtle">Rows with an empty numeric value are ignored for sum/average. Invalid numbers are rejected. Maximum 24 distinct categories; SVG chart is scalable and contains no executable scripts.</p>
     <div className="actions">
       <button className="primary-button" type="button" disabled={busy} onClick={()=>{void saveSvg();}}>Export chart SVG</button>
       <button className="secondary-button" type="button" disabled={busy} onClick={()=>{void saveSummary();}}>Export aggregated CSV</button>
     </div>
   </>}
   {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}
