import {useMemo,useRef,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {auditTextFiles,makeTextAuditCsv} from "../lib/batchTextAudit";
import {
  type BatchTextMode,type BatchTextSource,validateBatchTextSelection,
  processBatchTextFiles,zipBatchTextResults,
} from "../lib/batchTextFiles";

const OPS:{id:BatchTextMode;name:string}[]=[
  {id:"replace",name:"Batch literal find & replace · 多文件查找替换"},
  {id:"multi-replace",name:"Many replacements at once · 一次执行多条替换规则"},
  {id:"prefix-lines",name:"Add prefix to lines · 给每行添加前缀"},
  {id:"suffix-lines",name:"Add suffix to lines · 给每行添加后缀"},
  {id:"keep-matching",name:"Keep matching lines · 仅保留含关键词的行"},
  {id:"drop-matching",name:"Remove matching lines · 删除含关键词的行"},
  {id:"number-lines",name:"Number non-empty lines · 非空行自动编号"},
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
  const [ruleText,setRuleText]=useState("");
  const [lineAffix,setLineAffix]=useState("");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const selection=useRef(0);
  const preview=useMemo(()=>{
    if(!files.length)return {rows:[],error:""};
    try{return {rows:processBatchTextFiles(files,mode,find,replacement,ruleText,lineAffix),error:""};}
    catch(e){return {rows:[],error:msg(e)};}
  },[files,mode,find,replacement,ruleText,lineAffix]);
  const changed=preview.rows.filter(row=>row.changed);
  // Read-only source-file audit stays available even while an editing mode awaits input.
  const audit=useMemo(()=>files.length?auditTextFiles(files):[],[files]);
  const auditLines=audit.reduce((total,row)=>total+row.lines,0);
  const auditBytes=audit.reduce((total,row)=>total+row.bytes,0);
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
  async function saveAuditCsv(){
    if(!audit.length||busy)return;
    setBusy(true);setStatus("");
    try{
      const exported=await exportFile("sentinel-box-text-file-audit.csv",makeTextAuditCsv(audit));
      setStatus(exported?"Saved read-only metadata audit for "+audit.length+" selected file(s). Original files remain unchanged.":"Audit save cancelled; source files unchanged.");
    }catch(e){setStatus("Audit export failed: "+msg(e));}
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
    {mode==="multi-replace"&&<>
      <label htmlFor="batch-text-rules" className="field-label">Replace many phrases · 从表格粘贴两列（查找 Tab 替换）</label>
      <textarea id="batch-text-rules" data-testid="batch-text-rules" className="field text-editor" rows={6}
        maxLength={20000} value={ruleText} onChange={e=>{setRuleText(e.target.value);setStatus("");}}
        placeholder={"旧名称\t新名称\n2025\t2026"}/>
      <p className="subtle" data-testid="batch-rules-warning">Paste up to 20 TAB-separated rows from a spreadsheet: find phrase in column 1, replacement in column 2. Empty replacement deletes the phrase. Rules run sequentially (later rules can match earlier replacements), case-sensitive and literal, with no regex. No phrases are stored in the ZIP audit manifest, only match counts. Review any CSV delimiters and Markdown syntax before exporting.</p>
    </>}
    {(mode==="prefix-lines"||mode==="suffix-lines")&&<>
      <label htmlFor="batch-text-affix" className="field-label">Text to add to each non-empty line · 行首/行尾内容（最多100字）</label>
      <input id="batch-text-affix" data-testid="batch-text-affix" className="field"
        maxLength={100} value={lineAffix} onChange={e=>{setLineAffix(e.target.value);setStatus("");}}
        placeholder={mode==="prefix-lines"?"例如：- ":"例如：；"}/>
      <p className="subtle" data-testid="batch-affix-warning">TXT/Markdown only. Blank and whitespace-only lines are untouched. Existing line breaks, indentation and UTF-8 BOM stay intact. Adding a prefix or suffix may change Markdown formatting; check the preview.</p>
    </>}
    {(mode==="keep-matching"||mode==="drop-matching")&&<>
      <label className="field-label" htmlFor="batch-line-needle">Literal line keyword · 查找行关键词（区分大小写）
        <input id="batch-line-needle" data-testid="batch-line-needle" className="field"
          maxLength={1000} value={find} onChange={e=>{setFind(e.target.value);setStatus("");}}
          placeholder="例如：待办 / TODO"/>
      </label>
      <p className="subtle" data-testid="batch-filter-warning">This action uses exact, case-sensitive substring matching within each physical line, not regex. A file with no matches may yield an empty copy when keeping lines. Check the preview and byte counts before exporting. Works only on TXT/Markdown, not multiline CSV/TSV.</p>
    </>}
    {mode==="number-lines"&&<p className="subtle" data-testid="batch-number-warning">Numbers non-blank lines starting at 1 for each file (1. , 2. , …), preserving blank lines, indentation and original line endings. Existing list numbering is not detected; review Markdown formatting before export. CSV/TSV cannot use this mode.</p>}
    {(mode==="trim-trailing"||mode==="remove-blank"||mode==="dedupe-lines"||mode==="prefix-lines"||mode==="suffix-lines"||mode==="keep-matching"||mode==="drop-matching"||mode==="number-lines")&&<p className="subtle" data-testid="batch-line-warning">Line cleaning is available for TXT and Markdown only. It preserves each surviving line's CRLF/LF/CR ending and original UTF-8 BOM. Use the CSV Table Desk for CSV/TSV, whose quoted fields may contain line breaks. Deduplication is exact and case-sensitive; review line order before exporting.</p>}
    <p className="subtle">LF / CRLF conversion keeps all other characters and UTF-8 BOM intact; BOM removal is a separate, explicit option. Only changed files appear inside the ZIP. A JSON report lists unchanged files too.</p>
    {audit.length>0&&<div data-testid="batch-text-audit">
      <h4>File audit · 批量文件统计（只读）</h4>
      <p className="subtle">Source-file metadata only; this report does not depend on your selected editing action. Counts Unicode code points (not visual characters or linguistic words) and physical lines (not CSV records). Filenames and counts are exported, never the document contents. CSV filename cells are protected against spreadsheet formula execution.</p>
      <p className="stat-pill" data-testid="batch-audit-total">{audit.length} files · {auditBytes} bytes · {auditLines} physical lines</p>
      <div className="task-list" data-testid="batch-audit-list">
        {audit.map(row=><div className="task-row" key={row.name}>
          <div className="task-copy">
            <strong>{row.name}</strong> · {row.bytes} bytes · {row.characters} code points · {row.lines} lines ({row.nonBlankLines} nonblank)
            <div className="subtle">CRLF {row.crlf} · LF {row.lf} · CR {row.cr} · trailing spaces {row.trailingSpaceLines} · BOM {row.utf8Bom?"Yes":"No"}</div>
          </div>
        </div>)}
      </div>
      <button type="button" className="secondary-button" data-testid="batch-audit-save" disabled={busy}
        onClick={()=>{void saveAuditCsv();}}>Export source-file audit CSV · 导出统计表</button>
    </div>}
    {preview.error&&<p role="alert" data-testid="batch-text-error" className="subtle">{preview.error}</p>}
    {preview.rows.length>0&&<div data-testid="batch-text-preview">
      <p className="stat-pill">{preview.rows.length} selected · {changed.length} changed · {preview.rows.reduce((sum,row)=>sum+row.matches,0)} operations</p>
      <div className="task-list">
        {preview.rows.map(row=><div className="task-row" key={row.name}>
          <div className="task-copy">
            <strong>{row.name}</strong> · {row.changed?"Changed":"Unchanged"} · {row.matches} operations · {row.beforeBytes} → {row.afterBytes} bytes
            {row.ruleCounts&&<span className="subtle" data-testid="batch-rule-counts"> · Rule hits: {row.ruleCounts.map((count,i)=>`${i+1}: ${count}`).join(" · ")}</span>}
            {row.changed&&row.afterBytes<=3&&<p className="subtle" data-testid="batch-empty-warning">Result may be empty after filtering. The original file is untouched.</p>}
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
