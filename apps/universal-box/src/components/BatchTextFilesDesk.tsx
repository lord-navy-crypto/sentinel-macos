import {useMemo,useRef,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {
  type BatchTextMode,type BatchTextSource,validateBatchTextSelection,
  processBatchTextFiles,zipBatchTextResults,
} from "../lib/batchTextFiles";

const OPS:{id:BatchTextMode;name:string}[]=[
  {id:"replace",name:"Batch literal find & replace · 多文件查找替换"},
  {id:"lf",name:"Convert newlines to LF · 转 Unix 换行"},
  {id:"crlf",name:"Convert newlines to CRLF · 转 Windows 换行"},
  {id:"remove-bom",name:"Remove UTF-8 BOM · 删除 UTF-8 BOM"},
  {id:"trim-trailing",name:"Trim trailing spaces/tabs · 清理行尾空格"},
  {id:"remove-blank",name:"Remove blank lines · 删除空行"},
  {id:"dedupe-lines",name:"Remove duplicate lines · 删除重复行"},
];
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function BatchTextFilesDesk(){
  const [files,setFiles]=useState<BatchTextSource[]>([]);
  const [mode,setMode]=useState<BatchTextMode>("replace");
  const [find,setFind]=useState("");
  const [replacement,setReplacement]=useState("");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const selection=useRef(0);
  const preview=useMemo(()=>{
    if(!files.length)return {rows:[],error:""};
    try{return {rows:processBatchTextFiles(files,mode,find,replacement),error:""};}
    catch(e){return {rows:[],error:msg(e)};}
  },[files,mode,find,replacement]);
  const changed=preview.rows.filter(row=>row.changed);
  async function load(event:ChangeEvent<HTMLInputElement>){
    const chosen=Array.from(event.target.files??[]);
    event.target.value="";
    if(!chosen.length)return;
    const current=++selection.current;
    setFiles([]);setStatus("");
    try{
      validateBatchTextSelection(chosen);
      const decoded=await Promise.all(chosen.map(async file=>({
        name:file.name,bytes:new Uint8Array(await file.arrayBuffer()),
      })));
      if(current!==selection.current)return;
      // Run decoding validation before retaining anything in this editor.
      processBatchTextFiles(decoded,"remove-bom");
      setFiles(decoded);
      setStatus("Selected "+decoded.length+" local text file(s). Review the preview before exporting.");
    }catch(e){if(current===selection.current)setStatus("Import rejected: "+msg(e));}
  }
  async function saveZip(){
    if(!changed.length||preview.error||busy)return;
    setBusy(true);setStatus("");
    try{
      const bytes=await zipBatchTextResults(preview.rows,mode);
      const saved=await exportFile("sentinel-box-text-file-copies.zip",bytes);
      setStatus(saved?"Exported "+changed.length+" changed copy/copies. Originals remain unchanged.":"Save cancelled; source files unchanged.");
    }catch(e){setStatus("Export failed: "+msg(e));}
    finally{setBusy(false);}
  }
  return <section className="panel" data-testid="batch-text-files">
    <h3>Batch text file desk · 文本文件批量工具</h3>
    <p className="subtle">Select only the files you choose, preview local edits, then save changed copies in one ZIP. Nothing is uploaded, watched in the background or written back to your source files. Strict UTF-8 only: not suitable for .docx/.xlsx or unknown legacy encodings.</p>
    <label className="field-label" htmlFor="batch-text-picker">Choose up to 20 local TXT / Markdown / CSV / TSV files (200 KB each; 2 MB total)</label>
    <input id="batch-text-picker" data-testid="batch-text-picker" className="field" type="file" multiple accept=".txt,.md,.markdown,.csv,.tsv,text/plain,text/csv" onChange={e=>{void load(e);}}/>
    <label className="field-label" htmlFor="batch-text-mode">Operation · 处理方式</label>
    <select id="batch-text-mode" data-testid="batch-text-mode" className="field"
      value={mode} onChange={e=>{setMode(e.target.value as BatchTextMode);setStatus("");}}>
      {OPS.map(op=><option key={op.id} value={op.id}>{op.name}</option>)}
    </select>
    {mode==="replace"&&<>
      <div className="tools-pair">
        <label className="field-label" htmlFor="batch-text-find">Find exact text (case sensitive)
          <input id="batch-text-find" data-testid="batch-text-find" className="field" maxLength={1000} value={find} onChange={e=>{setFind(e.target.value);setStatus("");}}/>
        </label>
        <label className="field-label" htmlFor="batch-text-replacement">Replace with (may be empty to delete)
          <input id="batch-text-replacement" data-testid="batch-text-replacement" className="field" maxLength={10000} value={replacement} onChange={e=>{setReplacement(e.target.value);setStatus("");}}/>
        </label>
      </div>
      <p className="subtle">Matches literal characters, not regex. Quoted CSV cells and Markdown markup are not structurally parsed; review the output when replacing commas or punctuation.</p>
    </>}
    {(mode==="trim-trailing"||mode==="remove-blank"||mode==="dedupe-lines")&&<p className="subtle" data-testid="batch-line-warning">Line cleaning is available for TXT and Markdown only. It preserves each surviving line's CRLF/LF/CR ending and original UTF-8 BOM. Use the CSV Table Desk for CSV/TSV, whose quoted fields may contain line breaks. Deduplication is exact and case-sensitive; review line order before exporting.</p>}
    <p className="subtle">LF / CRLF conversion keeps all other characters and UTF-8 BOM intact; BOM removal is a separate, explicit option. Only changed files appear inside the ZIP. A JSON report lists unchanged files too.</p>
    {preview.error&&<p role="alert" data-testid="batch-text-error" className="subtle">{preview.error}</p>}
    {preview.rows.length>0&&<div data-testid="batch-text-preview">
      <p className="stat-pill">{preview.rows.length} selected · {changed.length} changed · {preview.rows.reduce((sum,row)=>sum+row.matches,0)} operations</p>
      <div className="task-list">
        {preview.rows.map(row=><div className="task-row" key={row.name}>
          <div className="task-copy">
            <strong>{row.name}</strong> · {row.changed?"Changed":"Unchanged"} · {row.matches} operations · {row.beforeBytes} → {row.afterBytes} bytes
            {row.changed&&<pre className="analysis-result" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:120,overflow:"auto"}}>{row.preview}{row.preview.length===250?"…":""}</pre>}
          </div>
        </div>)}
      </div>
    </div>}
    <button type="button" data-testid="batch-text-save" className="primary-button" disabled={busy||!changed.length||!!preview.error}
      onClick={()=>{void saveZip();}}>{busy?"Preparing verified ZIP…":"Save changed copies as ZIP"}</button>
    {status&&<p role="status" data-testid="batch-text-status" className="subtle">{status}</p>}
  </section>;
}
