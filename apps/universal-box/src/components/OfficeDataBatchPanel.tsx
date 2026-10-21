import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {parseWorkspaceCsv} from "../lib/csvCleanroom";
import {exportBatchText,exportCsvJoin,joinTwoCsv,makeWordMailMerge,planBatchText,planWordMailMerge,
 type SourceText,type JoinMode} from "../lib/officeDataBatch";

export type OfficeDataMode="mail-merge"|"csv-key-join"|"text-file-batch";
const fail=(e:unknown)=>e instanceof Error?e.message:String(e);
async function readUtf8(file:File,limit:number){
 if(file.size<1||file.size>limit)throw Error("Choose a file between 1 byte and "+limit+" bytes.");
 return new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/u,"");
}
export default function OfficeDataBatchPanel({mode}:{mode:OfficeDataMode}){
 const [csv,setCsv]=useState("Name,Project\nAlice,Geography\nBob,Physics"),
  [template,setTemplate]=useState("# Project Invitation\n\nDear {{Name}},\n\nYou are invited to join {{Project}}.\n\nBest regards,\nSentinel Box"),
  [left,setLeft]=useState("ID,Name,Score\n001,Alice,95\n002,Bob,90"),
  [right,setRight]=useState("ID,Group,Teacher\n001,Science,Liu\n003,Arts,Zhang"),
  [joinKey,setJoinKey]=useState("ID"),[joinMode,setJoinMode]=useState<JoinMode>("full"),
  [files,setFiles]=useState<SourceText[]>([]),[find,setFind]=useState("draft"),[replacement,setReplacement]=useState("final"),
  [status,setStatus]=useState(""),[busy,setBusy]=useState(false),[batchReport,setBatchReport]=useState<{name:string;matches:number;status:string}[]>([]);
 const mail=useMemo(()=>{try{return {result:planWordMailMerge(csv,template),error:""};}
  catch(e){return {result:null,error:fail(e)};}},[csv,template]);
 const csvJoin=useMemo(()=>{try{return {result:joinTwoCsv(left,right,joinKey,joinMode),error:""};}
  catch(e){return {result:null,error:fail(e)};}},[left,right,joinKey,joinMode]);
 const batch=useMemo(()=>{try{return {result:planBatchText(files,find,replacement),error:""};}
  catch(e){return {result:null,error:files.length?fail(e):""};}},[files,find,replacement]);
 async function openCsv(event:ChangeEvent<HTMLInputElement>,kind:"mail"|"left"|"right"){
  const file=event.target.files?.[0];event.target.value="";if(!file)return;
  setStatus("");
  try{
   if(!/\.csv$/iu.test(file.name))throw Error("Select a .csv file.");
   const text=await readUtf8(file,350000);
   if(kind==="mail")setCsv(text);else if(kind==="left")setLeft(text);else setRight(text);
   setStatus("Loaded "+file.name+" locally.");
  }catch(e){setStatus("Could not load CSV: "+fail(e));}
 }
 async function openTextFiles(event:ChangeEvent<HTMLInputElement>){
  const chosen=[...(event.target.files??[])];event.target.value="";setFiles([]);setBatchReport([]);setStatus("");
  if(!chosen.length)return;
  try{
   if(chosen.length>20)throw Error("Maximum 20 user-selected text files.");
   const loaded:SourceText[]=[];
   let bytes=0;
   for(const file of chosen){
    bytes+=file.size;if(bytes>2_000_000)throw Error("Total selected text files exceed 2 MB.");
    if(!/\.(txt|md|csv|tsv|json|srt|vtt)$/iu.test(file.name))throw Error("Unsupported file extension: "+file.name);
    loaded.push({name:file.name,text:await readUtf8(file,200000)});
   }
   setFiles(loaded);setStatus("Loaded "+loaded.length+" text files locally. No originals were modified.");
  }catch(e){setStatus("Could not load files: "+fail(e));}
 }
 async function save(kind:OfficeDataMode){
  if(busy)return;setBusy(true);setStatus("");
  try{
   if(kind==="mail-merge"){
    const bytes=await makeWordMailMerge(csv,template);
    const ok=await exportFile("sentinel-box-word-mail-merge.zip",bytes);
    setStatus(ok?"Saved editable Word documents (one per CSV row) and an audit manifest. No emails were sent.":"Save cancelled.");
   }else if(kind==="csv-key-join"){
    const bytes=await exportCsvJoin(left,right,joinKey,joinMode);
    const ok=await exportFile("sentinel-box-keyed-csv-join.zip",bytes);
    setStatus(ok?"Saved a joined CSV with statistics and source-independent audit.":"Save cancelled.");
   }else{
    const result=await exportBatchText(files,find,replacement);
    setBatchReport(result.report.map(x=>({name:x.filename,matches:x.matches,status:x.status})));
    const ok=await exportFile("sentinel-box-text-replacements.zip",result.bytes);
    setStatus(ok?"Saved replacement copies of changed files and a per-file report. Unchanged originals are untouched.":"Save cancelled.");
   }
  }catch(e){setStatus("Operation failed: "+fail(e));}finally{setBusy(false);}
 }
 const textarea=(id:string,label:string,value:string,update:(s:string)=>void,rows=7)=>
  <label className="field-label">{label}<textarea data-testid={id} className="field text-editor" rows={rows}
   maxLength={350000} spellCheck={false} value={value} onChange={e=>{update(e.target.value);setStatus("");}}/></label>;
 return <section className="panel" data-testid="office-data-batch" aria-label="Production automation desk">
  <p className="eyebrow">SENTINEL BOX · OFFICE, DATA & FILE AUTOMATION</p>
  {mode==="mail-merge"&&<>
   <h3>CSV → 多份 Word · Mail Merge</h3>
   <p className="subtle">通过 CSV 每行数据填充 <code>{"{{Column}}"}</code> 字段，生成一组真正可编辑的 DOCX；支持中文、英文，最多 20 人／份。不会发送邮件、不上传表格，也不会在 ZIP 报告里重复存储收件人的详细资料。</p>
   <label className="field-label">导入本地 CSV<input data-testid="batch-mail-file" className="field" type="file" accept=".csv,text/csv" onChange={e=>void openCsv(e,"mail")}/></label>
   {textarea("batch-mail-csv","CSV 数据（仅本地处理）",csv,setCsv,6)}
   {textarea("batch-mail-template","Word Markdown 模板（使用双花括号字段）",template,setTemplate,8)}
   {mail.error?<p className="subtle" role="alert">{mail.error}</p>:mail.result&&
    <p data-testid="batch-mail-plan" className="subtle">准备生成 {mail.result.rowCount} 个 Word 文件；匹配字段：{mail.result.fields.join("，")}</p>}
   <button type="button" className="primary-button" data-testid="batch-mail-export" disabled={busy||!!mail.error} onClick={()=>void save("mail-merge")}>生成并导出 Word ZIP</button>
  </>}
  {mode==="csv-key-join"&&<>
   <h3>CSV Key Join · 按关键字段合并两张表</h3>
   <p className="subtle">使用两张 CSV 的共同关键列进行 inner/left/full 合并，保留如 001 等字符串编号。不自动执行表格公式；遇到重复或空白关键字段会明确报错，防止错误的多对多匹配。</p>
   <div className="tools-pair">
    <label className="field-label">左表 CSV<input data-testid="batch-join-left-file" className="field" type="file" accept=".csv" onChange={e=>void openCsv(e,"left")}/></label>
    <label className="field-label">右表 CSV<input data-testid="batch-join-right-file" className="field" type="file" accept=".csv" onChange={e=>void openCsv(e,"right")}/></label>
   </div>
   <div className="tools-pair">
    <label className="field-label">共同关键列<input data-testid="batch-join-key" className="field" value={joinKey} onChange={e=>setJoinKey(e.target.value)}/></label>
    <label className="field-label">合并方式<select data-testid="batch-join-mode" className="field" value={joinMode} onChange={e=>setJoinMode(e.target.value as JoinMode)}>
     <option value="inner">Inner · 仅匹配</option><option value="left">Left · 左表全部</option><option value="full">Full · 双表全部</option>
    </select></label>
   </div>
   {textarea("batch-join-left","左表 CSV 预览／编辑",left,setLeft,6)}
   {textarea("batch-join-right","右表 CSV 预览／编辑",right,setRight,6)}
   {csvJoin.error?<p role="alert" className="subtle">{csvJoin.error}</p>:csvJoin.result&&<>
    <p data-testid="batch-join-stats" className="subtle">{csvJoin.result.rows.length} 输出行 · {csvJoin.result.matches} 匹配 · 左表未匹配 {csvJoin.result.unmatchedLeft} · 右表未匹配 {csvJoin.result.unmatchedRight}</p>
    <pre data-testid="batch-join-preview" style={{maxHeight:210,whiteSpace:"pre-wrap",overflow:"auto"}}>{csvJoin.result.csv.slice(0,4000)}</pre>
   </>}
   <button type="button" data-testid="batch-join-export" className="primary-button" disabled={busy||!!csvJoin.error} onClick={()=>void save("csv-key-join")}>导出合并结果 ZIP</button>
  </>}
  {mode==="text-file-batch"&&<>
   <h3>批量文本替换 · Safe Literal Replace</h3>
   <p className="subtle">一次选择 1–20 个 UTF-8 文本文件，对每份文件执行精确字面查找替换；不执行正则表达式，不直接改动原件。ZIP 仅包含有修改的副本，以及各文件匹配次数和失败报告。</p>
   <label className="field-label">选择多个文本文件<input data-testid="batch-text-files" className="field" type="file" multiple
    accept=".txt,.md,.csv,.tsv,.json,.srt,.vtt" onChange={e=>void openTextFiles(e)}/></label>
   <div className="tools-pair">
    <label className="field-label">查找内容<input data-testid="batch-text-find" className="field" value={find} maxLength={1000} onChange={e=>setFind(e.target.value)}/></label>
    <label className="field-label">替换为<input data-testid="batch-text-with" className="field" value={replacement} maxLength={10000} onChange={e=>setReplacement(e.target.value)}/></label>
   </div>
   {batch.error?<p className="subtle" role="alert">{batch.error}</p>:batch.result&&
    <p data-testid="batch-text-count" className="subtle">{batch.result} 个文件准备就绪；没有被修改的文件不会重复生成副本。</p>}
   <button type="button" data-testid="batch-text-export" className="primary-button" disabled={busy||!batch.result} onClick={()=>void save("text-file-batch")}>导出替换结果 ZIP</button>
   {batchReport.map((x,i)=><p data-testid="batch-text-report" key={i} className="subtle">{x.name} · {x.status} · {x.matches} matches</p>)}
  </>}
  {status&&<p role="status" className="subtle" data-testid="batch-status">{status}</p>}
  <p className="subtle">隐私：所有工具都在设备本地处理手动提供的数据；需要明确点击导出。ZIP 生成的新文件可能包含个人信息，请自行保管；转换不会删除或覆盖原件。</p>
 </section>;
}
