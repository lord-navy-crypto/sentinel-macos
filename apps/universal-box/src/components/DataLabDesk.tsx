import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {inspectNdjson,ndjsonToCsv,ndjsonToJson} from "../lib/ndjsonAudit";
import {auditMarkdownLocalLinks,markdownAuditCsv,type LocalLinkFile} from "../lib/markdownLinksAudit";
import {profileCsv,profileCsvReportCsv} from "../lib/csvProfileAudit";

export type DataLabMode="ndjson-audit"|"markdown-link-audit"|"csv-profile";
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
const sampleNdjson='{"id":1,"name":"Physics","score":98}\n{"id":2,"name":"Chemistry","score":94}\n{"id":3,"name":"Mathematics","score":95}';
const sampleCsv="id,subject,score,date\n1,Physics,98,2026-10-20\n2,Chemistry,94,2026-10-21\n3,Math,,2026-10-22";
const exampleFiles:LocalLinkFile[]=[
 {path:"README.md",markdown:"# Starter\n[Guide](guide.md)\n[Missing page](missing.md)\n[Public website](https://example.org)"},
 {path:"guide.md",markdown:"# Guide\nThis page exists locally."},
];
export default function DataLabDesk({mode}:{mode:DataLabMode}){
 const [ndjson,setNdjson]=useState(sampleNdjson),[csv,setCsv]=useState(sampleCsv),
 [files,setFiles]=useState<LocalLinkFile[]>(exampleFiles),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const ndReport=useMemo(()=>{try{return {value:inspectNdjson(ndjson),error:""};}catch(e){return {value:null,error:err(e)};}},[ndjson]);
 const csvReport=useMemo(()=>{try{return {value:profileCsv(csv),error:""};}catch(e){return {value:null,error:err(e)};}},[csv]);
 const links=useMemo(()=>{try{return {value:auditMarkdownLocalLinks(files),error:""};}catch(e){return {value:null,error:err(e)};}},[files]);
 async function importText(e:ChangeEvent<HTMLInputElement>,kind:"ndjson"|"csv"){
  const f=e.target.files?.[0];e.target.value="";setStatus("");if(!f)return;
  try{
   const exts=kind==="ndjson"?/\.(ndjson|jsonl)$/iu:/\.csv$/iu;
   const cap=kind==="ndjson"?500_000:450_000;
   if(!exts.test(f.name)||f.size>cap)throw Error("Choose a supported text file within "+cap+" bytes.");
   const content=new TextDecoder("utf-8",{fatal:true}).decode(await f.arrayBuffer());
   if(kind==="ndjson")setNdjson(content);else setCsv(content);
   setStatus("Imported from the selected file; no cloud upload or source edits.");
  }catch(e){setStatus("Import error: "+err(e));}
 }
 async function importMarkdown(e:ChangeEvent<HTMLInputElement>){
  const selected=[...(e.target.files??[])];e.target.value="";setStatus("");if(!selected.length)return;
  setBusy(true);
  try{
   if(selected.length>100)throw Error("Select no more than 100 files.");
   let bytes=0;const results:LocalLinkFile[]=[];
   for(const f of selected){
    const path=f.webkitRelativePath||f.name;
    if(/\.md(?:own)?$/iu.test(path)){
     bytes+=f.size;
     if(f.size>100_000||bytes>400_000)throw Error("Markdown text files exceed safety limits.");
     const markdown=new TextDecoder("utf-8",{fatal:true}).decode(await f.arrayBuffer());
     results.push({path,markdown});
    }else results.push({path});
   }
   const report=auditMarkdownLocalLinks(results);
   setFiles(results);setStatus("Loaded "+report.files+" selected files; only Markdown text was read.");
  }catch(e){setStatus("Import error: "+err(e));}finally{setBusy(false);}
 }
 async function save(kind:"ndjson-json"|"ndjson-csv"|"ndjson-audit"|"markdown-csv"|"markdown-json"|"profile-csv"|"profile-json"){
  if(busy)return;setBusy(true);setStatus("");
  try{
   let filename="",output="";
   switch(kind){
    case "ndjson-json":{
     const r=inspectNdjson(ndjson);filename="sentinel-ndjson-records.json";output=ndjsonToJson(r);break;
    }
    case "ndjson-csv":{
     const r=inspectNdjson(ndjson);filename="sentinel-ndjson-records.csv";output=ndjsonToCsv(r);break;
    }
    case "ndjson-audit":{
     const r=inspectNdjson(ndjson);filename="sentinel-ndjson-audit.json";
     output=JSON.stringify({totalLines:r.totalLines,validRecords:r.validRecords,invalidRecords:r.invalidRecords,fields:r.fields,missing:r.missing,issues:r.issues},null,2);break;
    }
    case "markdown-csv":filename="sentinel-markdown-links.csv";output=markdownAuditCsv(auditMarkdownLocalLinks(files));break;
    case "markdown-json":filename="sentinel-markdown-links.json";output=JSON.stringify(auditMarkdownLocalLinks(files),null,2);break;
    case "profile-csv":filename="sentinel-csv-profile.csv";output=profileCsvReportCsv(profileCsv(csv));break;
    case "profile-json":filename="sentinel-csv-profile.json";output=JSON.stringify(profileCsv(csv),null,2);break;
   }
   setStatus(await exportFile(filename,output)?"Saved "+filename+". Source inputs unchanged.":"Save cancelled.");
  }catch(e){setStatus("Export error: "+err(e));}finally{setBusy(false);}
 }
 return <section className="panel" data-testid="data-lab-desk">
  <p className="eyebrow">SENTINEL BOX · OFFLINE DATA VALIDATION</p>
  {mode==="ndjson-audit"&&<>
   <h3>NDJSON / JSONL 文件校验与格式转换</h3>
   <p className="subtle">逐行解析最多 5,000 条 JSON 对象，报告准确的错误行和缺失字段。只有全部行合法才允许导出 JSON 数组或 CSV，不会偷偷丢弃错误数据。CSV 导出自动保护公式型文本。</p>
   <label className="field-label">选择 .ndjson / .jsonl 文件<input data-testid="ndjson-file" className="field" type="file" accept=".ndjson,.jsonl" onChange={e=>void importText(e,"ndjson")}/></label>
   <label className="field-label">逐行 JSON 内容<textarea data-testid="ndjson-source" className="field text-editor" rows={9} maxLength={500000} value={ndjson} onChange={e=>setNdjson(e.target.value)} spellCheck={false}/></label>
   {ndReport.error?<p role="alert">{ndReport.error}</p>:ndReport.value&&<>
    <p data-testid="ndjson-summary">{ndReport.value.validRecords} valid records · {ndReport.value.invalidRecords} invalid records · {ndReport.value.fields.length} fields</p>
    <p className="subtle">Fields: {ndReport.value.fields.join(", ")||"(none)"}</p>
    <div style={{maxHeight:160,overflow:"auto"}}>{ndReport.value.issues.slice(0,20).map((x,i)=><p key={i}>Line {x.line}: {x.reason}</p>)}</div>
   </>}
   <div className="actions">
    <button type="button" className="primary-button" data-testid="ndjson-json" disabled={busy||!ndReport.value||!!ndReport.value.invalidRecords||!ndReport.value.validRecords} onClick={()=>void save("ndjson-json")}>转换为 JSON</button>
    <button type="button" data-testid="ndjson-csv" disabled={busy||!ndReport.value||!!ndReport.value.invalidRecords||!ndReport.value.validRecords||!ndReport.value.fields.length} onClick={()=>void save("ndjson-csv")}>转换为 CSV</button>
    <button type="button" data-testid="ndjson-report" disabled={busy||!ndReport.value} onClick={()=>void save("ndjson-audit")}>导出错误报告</button>
   </div>
  </>}
  {mode==="markdown-link-audit"&&<>
   <h3>Markdown 本地链接完整性审计</h3>
   <p className="subtle">导入含 Markdown 文档的文件集合，检查相对路径图片与文档链接是否指向选中的文件；跳过外部网页和页内锚点，不访问互联网。支持本地文件夹选择以及普通多文件选择，最大 100 个文件。</p>
   <div className="tools-pair">
    <label className="field-label">选择整个文档目录<input data-testid="markdown-directory" className="field" type="file" multiple ref={el=>{if(el)el.setAttribute("webkitdirectory","");}} onChange={e=>void importMarkdown(e)}/></label>
    <label className="field-label">或选择 Markdown + 附件文件<input data-testid="markdown-files" className="field" type="file" multiple onChange={e=>void importMarkdown(e)}/></label>
   </div>
   {links.error?<p role="alert">{links.error}</p>:links.value&&<>
    <p data-testid="markdown-summary">{links.value.markdownFiles} Markdown files · {links.value.references.length} references · {links.value.broken} missing · {links.value.unsafe} unsafe</p>
    <div style={{maxHeight:260,overflow:"auto"}}>{links.value.references.slice(0,50).map((x,i)=><p key={i}>{x.source}:{x.line} · <strong>{x.status}</strong> · {x.target} → {x.resolved||"(unresolved)"}</p>)}</div>
   </>}
   <div className="actions">
    <button type="button" className="primary-button" data-testid="markdown-csv" disabled={busy||!links.value} onClick={()=>void save("markdown-csv")}>导出链接 CSV</button>
    <button type="button" data-testid="markdown-json" disabled={busy||!links.value} onClick={()=>void save("markdown-json")}>导出 JSON</button>
   </div>
  </>}
  {mode==="csv-profile"&&<>
   <h3>CSV 数据质量画像 / Column Profiler</h3>
   <p className="subtle">使用 Sentinel Box 原有 CSV 解析器，检查每列缺失值、非空唯一值、谨慎推断的数据类型，并计算数值列最小值、最大值和均值。不更改原始行，不做统计显著性或自动修正。</p>
   <label className="field-label">导入 .csv 文件<input data-testid="csv-profile-file" className="field" type="file" accept=".csv,text/csv" onChange={e=>void importText(e,"csv")}/></label>
   <label className="field-label">CSV 内容<textarea data-testid="csv-profile-source" className="field text-editor" rows={8} maxLength={450000} value={csv} onChange={e=>setCsv(e.target.value)} spellCheck={false}/></label>
   {csvReport.error?<p role="alert">{csvReport.error}</p>:csvReport.value&&<>
    <p data-testid="csv-profile-summary">{csvReport.value.rows} rows · {csvReport.value.columns.length} columns</p>
    <div style={{maxHeight:280,overflow:"auto"}}><table><thead><tr><th>Field</th><th>Type</th><th>Missing</th><th>Distinct</th><th>Min</th><th>Max</th></tr></thead>
     <tbody>{csvReport.value.columns.map(x=><tr key={x.index}><td>{x.name}</td><td>{x.type}</td><td>{x.missing}</td><td>{x.distinct}</td><td>{x.min??"–"}</td><td>{x.max??"–"}</td></tr>)}</tbody></table></div>
   </>}
   <div className="actions">
    <button type="button" className="primary-button" data-testid="csv-profile-report" disabled={busy||!csvReport.value} onClick={()=>void save("profile-csv")}>导出 CSV 审计</button>
    <button type="button" data-testid="csv-profile-json" disabled={busy||!csvReport.value} onClick={()=>void save("profile-json")}>导出 JSON</button>
   </div>
  </>}
  {status&&<p className="subtle" role="status" data-testid="data-lab-status">{status}</p>}
  <p className="subtle">Only explicitly selected files are read. No filesystem crawler, cloud upload, automatic content modification or subscription.</p>
 </section>;
}
