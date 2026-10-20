import {type ChangeEvent,useMemo,useState} from "react";
import {csvRows} from "./EverydayTools";
import {exportFile} from "../lib/output";
import {mergeCsvSources,mergedCsvExport,type MergedCsv} from "../lib/csvMerge";
import {filterSortTable,makeDataTable,tableToCsv,tableToJson,tableToMarkdown,type DataTable} from "../lib/tableTools";

export default function DataDesk(){
  const [source,setSource]=useState("Name,Score,Class\nAda,95,A\nBob,88,B\nCara,96,A");
  const [delimiter,setDelimiter]=useState<","|"\t">(",");
  const [header,setHeader]=useState(true);
  const [table,setTable]=useState<DataTable|null>(null);
  const [filter,setFilter]=useState("");
  const [filterColumn,setFilterColumn]=useState(-1);
  const [sortColumn,setSortColumn]=useState(-1);
  const [descending,setDescending]=useState(false);
  const [unique,setUnique]=useState(false);
  const [status,setStatus]=useState("");
  const [merged,setMerged]=useState<MergedCsv|null>(null);
  const [mergeNames,setMergeNames]=useState<string[]>([]);

  const visible=useMemo(()=>table?filterSortTable(table,filter,filterColumn<0?null:filterColumn,sortColumn<0?null:sortColumn,descending,unique):null,
    [table,filter,filterColumn,sortColumn,descending,unique]);
  async function importData(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    if(file.size>2_000_000){setStatus("Import limit: 2 MB. Nothing was imported.");return;}
    try{
      const text=await file.text();
      setSource(text);
      setDelimiter(file.name.toLowerCase().endsWith(".tsv")?"\t":",");
      setTable(null);
      setStatus("Loaded file locally. Select Load table to inspect its contents.");
    }catch(e){setStatus(String(e));}
  }
  async function mergeFiles(event:ChangeEvent<HTMLInputElement>){
    const files=[...(event.target.files??[])];event.target.value="";setStatus("");setMerged(null);
    try{
      if(files.length<2||files.length>12)throw Error("Select 2–12 CSV files.");
      const entries=[];
      for(const file of files){
        if(!/\.csv$/iu.test(file.name)||file.size>1_000_000)throw Error("Only CSV files up to 1 MB each are supported.");
        entries.push({name:file.name,rows:csvRows(await file.text())});
      }
      const result=mergeCsvSources(entries);
      setMerged(result);setMergeNames(files.map(f=>f.name));
      setStatus("Merged "+result.rows.length+" rows from "+files.length+" selected CSV files; review before saving.");
    }catch(e){setStatus("Merge failed: "+String(e instanceof Error?e.message:e));}
  }
  async function saveMerged(){
    if(!merged)return;
    try{
      const saved=await exportFile("universal-box-merged-csv.csv",mergedCsvExport(merged));
      setStatus(saved?"Merged CSV saved locally; source files unchanged.":"Save cancelled.");
    }catch(e){setStatus(String(e instanceof Error?e.message:e));}
  }
  function load(){
    try{
      if(source.length>2_000_000)throw Error("Text exceeds the 2 MB limit.");
      const next=makeDataTable(csvRows(source,delimiter),header);
      setTable(next);
      setFilter("");setFilterColumn(-1);setSortColumn(-1);setUnique(false);
      setStatus("Loaded "+next.rows.length+" data rows and "+next.headers.length+" columns. No upload.");
    }catch(e){setStatus("Cannot read table: "+String(e instanceof Error?e.message:e));}
  }
  async function save(format:"csv"|"json"|"md"){
    if(!visible)return;
    try{
      const data=format==="csv"?tableToCsv(visible):format==="json"?tableToJson(visible):tableToMarkdown(visible);
      const saved=await exportFile("daily-desk-table."+format,data);
      setStatus(saved?"Saved "+visible.rows.length+" visible rows as "+format.toUpperCase()+".":"Save cancelled.");
    }catch(e){setStatus("Export failed: "+String(e));}
  }
  return <section className="panel">
    <p className="eyebrow">OFFLINE DATA / TABLE WORKBENCH</p>
    <h2>CSV table desk · 表格处理</h2>
    <p className="subtle">Import or paste CSV/TSV. Search, sort, remove duplicate rows, preview and export CSV, JSON or Markdown. Originals remain unchanged.</p>
    <div className="actions">
      <label className="field-label" htmlFor="data-file">Import .csv / .tsv</label>
      <input id="data-file" type="file" className="field" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={event=>{void importData(event);}}/>
      <label className="field-label">Separator
        <select className="field" value={delimiter} onChange={event=>{setDelimiter(event.target.value as ","|"\t");setTable(null);}}>
          <option value=",">Comma (CSV)</option><option value={"\t"}>Tab (TSV)</option>
        </select>
      </label>
      <label className="field-label"><input type="checkbox" checked={header} onChange={event=>{setHeader(event.target.checked);setTable(null);}}/> First row contains column headings</label>
    </div>
    <div className="panel" style={{marginBottom:16}}>
      <h3>Merge CSV files · 合并多张表格</h3>
      <p className="subtle">Choose 2–12 CSV files (up to 1 MB each). Match columns by identical header names, keep source filenames, and leave missing cells blank. No files are overwritten or uploaded. Excel XLSX files should first be converted to CSV in Free Formats.</p>
      <input aria-label="Choose CSV files to merge" className="field" type="file" accept=".csv,text/csv" multiple onChange={e=>{void mergeFiles(e);}}/>
      {merged&&<>
        <p className="subtle">{mergeNames.join(", ")} · {merged.rows.length} rows · {merged.headers.length} columns</p>
        <div style={{overflowX:"auto",maxHeight:220,overflowY:"auto"}}>
          <table><thead><tr>{merged.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
          <tbody>{merged.rows.slice(0,8).map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table>
        </div>
        <button type="button" className="primary-button" onClick={()=>{void saveMerged();}}>Save merged CSV</button>
      </>}
    </div>
    <label className="field-label" htmlFor="data-text">Source data · private to this device</label>
    <textarea id="data-text" className="field text-editor" rows={7} maxLength={2000000} value={source} onChange={event=>{setSource(event.target.value);setTable(null);}}/>
    <div className="actions"><button className="primary-button" type="button" onClick={load}>Load table</button></div>
    {table&&visible&&<>
      <h3>Table preview · {visible.rows.length} / {table.rows.length} rows</h3>
      <div className="tools-pair">
        <label className="field-label">Search<input className="field" placeholder="Find in text cells" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
        <label className="field-label">Search column
          <select className="field" value={filterColumn} onChange={e=>setFilterColumn(Number(e.target.value))}>
            <option value={-1}>All columns</option>
            {table.headers.map((name,index)=><option key={index} value={index}>{name}</option>)}
          </select>
        </label>
        <label className="field-label">Sort by
          <select className="field" value={sortColumn} onChange={e=>setSortColumn(Number(e.target.value))}>
            <option value={-1}>Original order</option>
            {table.headers.map((name,index)=><option key={index} value={index}>{name}</option>)}
          </select>
        </label>
        <label className="field-label"><input type="checkbox" checked={descending} onChange={e=>setDescending(e.target.checked)}/> Descending</label>
        <label className="field-label"><input type="checkbox" checked={unique} onChange={e=>setUnique(e.target.checked)}/> Remove duplicate rows</label>
      </div>
      <div style={{overflowX:"auto",maxHeight:"440px",overflowY:"auto",border:"1px solid var(--line, #cbd5e1)",borderRadius:"8px"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}>
          <thead><tr>{visible.headers.map((name,index)=><th key={index} scope="col" style={{padding:8,textAlign:"left",borderBottom:"1px solid #94a3b8",whiteSpace:"nowrap"}}>{name}</th>)}</tr></thead>
          <tbody>{visible.rows.slice(0,80).map((row,index)=><tr key={index}>{row.map((value,i)=><td key={i} style={{padding:8,borderBottom:"1px solid #e2e8f0",maxWidth:340,overflowWrap:"anywhere"}}>{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {visible.rows.length>80&&<p className="subtle">Showing the first 80 rows for responsiveness. Exports include all {visible.rows.length} filtered rows.</p>}
      <div className="actions">
        <button className="secondary-button" type="button" onClick={()=>{void save("csv");}}>Save CSV</button>
        <button className="secondary-button" type="button" onClick={()=>{void save("json");}}>Save JSON</button>
        <button className="secondary-button" type="button" onClick={()=>{void save("md");}}>Save Markdown</button>
      </div>
      <p className="subtle">CSV export guards against formula injection when opened in a spreadsheet. All results are written to new files.</p>
    </>}
    {status&&<p role="status" className="subtle">{status}</p>}
  </section>;
}
