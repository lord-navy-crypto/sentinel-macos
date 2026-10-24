import {type ChangeEvent,useMemo,useState} from "react";
import {csvRows} from "./EverydayTools";
import {exportFile} from "../lib/output";
import {mergeCsvSources,mergedCsvExport,type MergedCsv} from "../lib/csvMerge";
import {filterSortTable,replaceTableCells,selectTableColumns,makeDataTable,tableToCsv,tableToTsv,tableToJson,tableToMarkdown,type DataTable} from "../lib/tableTools";

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
  const [removeEmptyRows,setRemoveEmptyRows]=useState(false);
  const [replaceEnabled,setReplaceEnabled]=useState(false);
  const [cellFind,setCellFind]=useState("");
  const [cellReplacement,setCellReplacement]=useState("");
  const [replaceColumn,setReplaceColumn]=useState(-1);
  const [selectedColumns,setSelectedColumns]=useState<number[]|null>(null);
  const [status,setStatus]=useState("");
  const [merged,setMerged]=useState<MergedCsv|null>(null);
  const [mergeNames,setMergeNames]=useState<string[]>([]);

  const visible=useMemo(()=>table?filterSortTable(table,filter,filterColumn<0?null:filterColumn,sortColumn<0?null:sortColumn,descending,unique,removeEmptyRows):null,
    [table,filter,filterColumn,sortColumn,descending,unique,removeEmptyRows]);
  const editPreview=useMemo(()=>{
    if(!visible||!replaceEnabled)return {table:visible,matches:0,changedCells:0,error:""};
    try{
      const edited=replaceTableCells(visible,cellFind,cellReplacement,replaceColumn<0?null:replaceColumn);
      return {...edited,error:""};
    }catch(e){return {table:null,matches:0,changedCells:0,error:e instanceof Error?e.message:String(e)};}
  },[visible,replaceEnabled,cellFind,cellReplacement,replaceColumn]);
  const projection=useMemo(()=>{
    if(!editPreview.table)return {table:null,error:editPreview.error};
    if(selectedColumns===null)return {table:editPreview.table,error:""};
    try{return {table:selectTableColumns(editPreview.table,selectedColumns),error:""};}
    catch(e){return {table:null,error:e instanceof Error?e.message:String(e)};}
  },[editPreview,selectedColumns]);
  const displayTable=projection.table;
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
      const next=makeDataTable(csvRows(source,delimiter,true),header);
      setTable(next);
      setFilter("");setFilterColumn(-1);setSortColumn(-1);setUnique(false);setRemoveEmptyRows(false);setReplaceEnabled(false);setReplaceColumn(-1);setCellFind("");setCellReplacement("");setSelectedColumns(null);
      setStatus("Loaded "+next.rows.length+" data rows and "+next.headers.length+" columns. No upload.");
    }catch(e){setStatus("Cannot read table: "+String(e instanceof Error?e.message:e));}
  }
  async function save(format:"csv"|"tsv"|"json"|"md"){
    if(!displayTable||editPreview.error||projection.error)return;
    try{
      const data=format==="csv"?tableToCsv(displayTable):format==="tsv"?"\ufeff"+tableToTsv(displayTable):format==="json"?tableToJson(displayTable):tableToMarkdown(displayTable);
      const saved=await exportFile("daily-desk-table."+format,data);
      setStatus(saved?"Saved "+displayTable.rows.length+" visible rows as "+format.toUpperCase()+".":"Save cancelled.");
    }catch(e){setStatus("Export failed: "+String(e));}
  }
  return <section className="panel">
    <p className="eyebrow">OFFLINE DATA / TABLE WORKBENCH</p>
    <h2>CSV table desk · 表格处理</h2>
    <p className="subtle">Import or paste CSV/TSV. Search, sort, remove duplicate or completely empty rows, preview and export CSV, TSV, JSON or Markdown. Originals remain unchanged.</p>
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
        <label className="field-label"><input type="checkbox" data-testid="table-remove-empty" checked={removeEmptyRows} onChange={e=>setRemoveEmptyRows(e.target.checked)}/> Exclude empty rows · 排除全空行</label>
      </div>
      <div className="panel" data-testid="table-column-selection">
        <h4>Choose columns for preview / export · 按列提取</h4>
        <p className="subtle">Select the fields to keep in your exported copy, such as Name and Department. Columns retain their original order. The imported table stays untouched. Filters and cell replacements run first, then hidden columns are omitted only from the preview and export.</p>
        <div className="actions">
          <button type="button" className="secondary-button" data-testid="table-cols-all" onClick={()=>setSelectedColumns(null)}>All columns · 全部</button>
          <button type="button" className="secondary-button" data-testid="table-cols-none" onClick={()=>setSelectedColumns([])}>Clear selection · 清空选择</button>
        </div>
        <div style={{maxHeight:155,overflowY:"auto",display:"flex",gap:10,flexWrap:"wrap"}} data-testid="table-cols-checks">
          {table.headers.map((name,index)=><label key={index} className="field-label">
            <input type="checkbox" data-testid={"table-col-"+index}
              checked={selectedColumns===null||selectedColumns.includes(index)}
              onChange={e=>{const checked=e.target.checked;setSelectedColumns(previous=>{
                const old=previous??table.headers.map((_,i)=>i);
                return checked?[...new Set([...old,index])].sort((a,b)=>a-b):old.filter(i=>i!==index);
              });}}/>
            {name}
          </label>)}
        </div>
        {projection.error&&!editPreview.error&&<p role="alert" data-testid="table-cols-error" className="subtle">{projection.error} No file will be exported until a column is selected.</p>}
        {displayTable&&<p className="subtle" data-testid="table-cols-count">{displayTable.headers.length} / {table.headers.length} columns included in preview/export</p>}
      </div>
      <div className="panel" data-testid="table-cell-replace">
        <h4>Find & replace in table cells · 按列查找替换</h4>
        <p className="subtle">Literal and case-sensitive, within data cells only. Choose one column or all columns. Search/filter/sort runs first; replacement affects only the current preview/export, never the imported CSV/TSV source or column headings. No regular expressions.</p>
        <div className="tools-pair">
          <label className="field-label" htmlFor="table-cell-find">Find · 查找
            <input id="table-cell-find" data-testid="table-cell-find" className="field"
              maxLength={1000} value={cellFind} onChange={e=>setCellFind(e.target.value)}
              placeholder="旧部门名称"/>
          </label>
          <label className="field-label" htmlFor="table-cell-with">Replace with · 替换为（可留空删除）
            <input id="table-cell-with" data-testid="table-cell-with" className="field"
              maxLength={10000} value={cellReplacement} onChange={e=>setCellReplacement(e.target.value)}
              placeholder="新部门名称"/>
          </label>
          <label className="field-label" htmlFor="table-replace-column">Column · 指定列
            <select id="table-replace-column" className="field" data-testid="table-replace-column"
              value={replaceColumn} onChange={e=>setReplaceColumn(Number(e.target.value))}>
              <option value={-1}>All data columns</option>
              {table.headers.map((name,index)=><option key={index} value={index}>{name}</option>)}
            </select>
          </label>
          <label className="field-label">
            <input type="checkbox" data-testid="table-replace-enable" checked={replaceEnabled}
              onChange={e=>setReplaceEnabled(e.target.checked)}/> Preview changes in exports · 预览并用于导出
          </label>
        </div>
        {editPreview.error?<p role="alert" data-testid="table-replace-error" className="subtle">{editPreview.error} Exports are paused until corrected or replacement preview is disabled.</p>:
          replaceEnabled&&<p className="subtle" data-testid="table-replace-count">{editPreview.matches} replacements in {editPreview.changedCells} cells (visible rows only). Turn off the checkbox to revert this preview.</p>}
      </div>
      <div style={{overflowX:"auto",maxHeight:"440px",overflowY:"auto",border:"1px solid var(--line, #cbd5e1)",borderRadius:"8px"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}>
          <thead><tr>{displayTable?.headers.map((name,index)=><th key={index} scope="col" style={{padding:8,textAlign:"left",borderBottom:"1px solid #94a3b8",whiteSpace:"nowrap"}}>{name}</th>)}</tr></thead>
          <tbody>{displayTable?.rows.slice(0,80).map((row,index)=><tr key={index}>{row.map((value,i)=><td key={i} style={{padding:8,borderBottom:"1px solid #e2e8f0",maxWidth:340,overflowWrap:"anywhere"}}>{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {displayTable&&displayTable.rows.length>80&&<p className="subtle">Showing the first 80 rows for responsiveness. Exports include all {displayTable.rows.length} filtered rows.</p>}
      <div className="actions">
        {editPreview.error&&<p className="subtle">Fix the find/replace settings or turn off preview to enable exports.</p>}
        <button disabled={!displayTable} className="secondary-button" type="button" onClick={()=>{void save("csv");}}>Save CSV</button>
        <button className="secondary-button" data-testid="table-save-tsv" type="button" disabled={!displayTable} onClick={()=>{void save("tsv");}}>Save TSV (Excel)</button>
        <button className="secondary-button" type="button" disabled={!displayTable} onClick={()=>{void save("json");}}>Save JSON</button>
        <button className="secondary-button" type="button" disabled={!displayTable} onClick={()=>{void save("md");}}>Save Markdown</button>
      </div>
      <p className="subtle">CSV and TSV exports protect formula-like values, quote embedded line breaks/delimiters, and save to new files. TSV output includes a UTF-8 BOM to help Excel recognize Chinese text. The empty-row checkbox changes only the filtered preview/export, never the imported source.</p>
    </>}
    {status&&<p role="status" className="subtle">{status}</p>}
  </section>;
}
