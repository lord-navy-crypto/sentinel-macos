import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {makeEpub,type EpubInput} from "../lib/epubMaker";
import {hashSelectedFiles,readIntegrityManifest,checkSelectedFiles,type IntegrityStatus} from "../lib/integrityVerifier";
import {inspectCsvKeys,exportCsvDuplicateAudit} from "../lib/csvDuplicateAudit";
import {parseWorkspaceCsv} from "../lib/csvCleanroom";

export type NextWaveMode="epub-create"|"hash-check"|"csv-key-audit";
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function NextWaveDesk({mode}:{mode:NextWaveMode}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const [title,setTitle]=useState("My Notes"),[author,setAuthor]=useState("Sentinel Box User");
 const [body,setBody]=useState("# My Notes\n\nA free, offline-first ebook.\n\n- First idea\n- Second idea");
 const [kind,setKind]=useState<EpubInput["kind"]>("markdown"),[language,setLanguage]=useState<EpubInput["language"]>("en");
 const [files,setFiles]=useState<File[]>([]),[baseline,setBaseline]=useState(""),[checks,setChecks]=useState<IntegrityStatus[]>([]);
 const [csv,setCsv]=useState("StudentID,Name,Score\n001,Alice,90\n002,Bob,80\n001,Alice,92");
 const [key1,setKey1]=useState("0"),[key2,setKey2]=useState("");
 const parsed=useMemo(()=>{try{
  const rows=parseWorkspaceCsv(csv);return {headers:rows[0]??[],error:""};
 }catch(e){return {headers:[] as string[],error:errorText(e)};}},[csv]);
 const chosenKeys=[Number(key1),...(key2===""?[]:[Number(key2)])];
 const review=useMemo(()=>{try{return {audit:inspectCsvKeys(csv,chosenKeys),error:""};}
  catch(e){return {audit:null,error:errorText(e)};}},[csv,key1,key2]);
 async function saveEpub(){
  if(busy)return;setBusy(true);setStatus("");
  try{const bytes=await makeEpub({title,author,language,body,kind});
   const saved=await exportFile("sentinel-box-notes.epub",bytes);
   setStatus(saved?"Saved a real offline EPUB 3 book. Text and basic Markdown headings/lists only.":"Save cancelled.");
  }catch(e){setStatus("EPUB export: "+errorText(e));}finally{setBusy(false);}
 }
 function chooseFiles(e:ChangeEvent<HTMLInputElement>){setFiles(Array.from(e.target.files??[]));e.target.value="";setChecks([]);setStatus("");}
 async function selectManifest(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";setChecks([]);if(!file)return;
  try{
   if(file.size>150000)throw Error("Manifest JSON must be at most 150 KB.");
   const raw=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
   readIntegrityManifest(raw);setBaseline(raw);setStatus("Loaded and validated local reference manifest.");
  }catch(err){setStatus("Manifest import: "+errorText(err));}
 }
 async function integrityAction(action:"create"|"verify"){
  if(busy)return;setBusy(true);setStatus("");setChecks([]);
  try{
   if(action==="create"){
    const result=await hashSelectedFiles(files);
    const raw=JSON.stringify(result,null,2);
    setBaseline(raw);
    const saved=await exportFile("sentinel-box-sha256.json",raw);
    setStatus(saved?"SHA-256 baseline saved. Choose a file set later to verify against it.":"Manifest generated but save cancelled.");
   }else{
    const reference=readIntegrityManifest(baseline);
    const results=await checkSelectedFiles(files,reference);setChecks(results);
    setStatus("Verified "+results.length+" names: "+results.filter(x=>x.state==="match").length+" matched, "+
     results.filter(x=>x.state!=="match").length+" missing, modified or extra.");
   }
  }catch(err){setStatus("Integrity check: "+errorText(err));}finally{setBusy(false);}
 }
 async function openCsv(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";if(!file)return;
  try{
   if(!/\.csv$/iu.test(file.name)||file.size>1000000)throw Error("Choose a CSV file at most 1 MB.");
   const raw=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
   parseWorkspaceCsv(raw);setCsv(raw);setKey1("0");setKey2("");setStatus("CSV imported locally. Select the columns that must be unique.");
  }catch(err){setStatus("CSV import: "+errorText(err));}
 }
 async function saveCsvAudit(){
  if(busy)return;setBusy(true);setStatus("");
  try{
   const {zip,audit}=await exportCsvDuplicateAudit(csv,chosenKeys);
   const saved=await exportFile("sentinel-box-csv-duplicate-audit.zip",zip);
   setStatus(saved?"Saved "+audit.groups.length+" duplicate-key groups and an audit report. Input unchanged.":"Save cancelled.");
  }catch(err){setStatus("CSV audit: "+errorText(err));}finally{setBusy(false);}
 }
 return <section className="panel" data-testid="next-wave-desk">
  <p className="eyebrow">SENTINEL BOX · OFFLINE EXPANSION</p>
  {mode==="epub-create"&&<>
   <h3>电子书制作 · TXT / Markdown → EPUB 3</h3>
   <p className="subtle">创建标准 EPUB 3 阅读文件，可在支持 EPUB 的阅读器中打开。支持文字、段落、Markdown 一级至三级标题和简单无序列表；不承诺复杂 Markdown 排版、图片或 PDF 转换。</p>
   <div className="tools-pair">
    <label className="field-label">Book title<input className="field" data-testid="epub-title" maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="field-label">Author<input className="field" data-testid="epub-author" maxLength={100} value={author} onChange={e=>setAuthor(e.target.value)}/></label>
    <label className="field-label">Source format<select className="field" value={kind} onChange={e=>setKind(e.target.value as EpubInput["kind"])}><option value="markdown">Basic Markdown</option><option value="text">Plain text</option></select></label>
    <label className="field-label">Language<select className="field" value={language} onChange={e=>setLanguage(e.target.value as EpubInput["language"])}><option value="en">English</option><option value="zh-CN">简体中文</option></select></label>
   </div>
   <label className="field-label">Book contents<textarea className="field text-editor" data-testid="epub-content" rows={10} maxLength={350000} value={body} onChange={e=>setBody(e.target.value)}/></label>
   <button className="primary-button" type="button" disabled={busy||!body.trim()||!title.trim()||!author.trim()} data-testid="epub-export" onClick={()=>void saveEpub()}>生成 EPUB 3 文件</button>
  </>}
  {mode==="hash-check"&&<>
   <h3>文件完整性 · SHA-256 基准清单与差异验证</h3>
   <p className="subtle">用户主动选择文件（最多 20 个／共 20 MB），生成 SHA-256 清单或与此前清单对比。识别一致、修改、缺失、额外文件；不会改动原件。这是完整性验证，不是杀毒软件，也不能证明来源可信。</p>
   <label className="field-label">选择待校验文件<input className="field" data-testid="hash-files" type="file" multiple onChange={chooseFiles}/></label>
   <p className="subtle">{files.length} 个已选择文件</p>
   <div className="actions">
    <button className="primary-button" type="button" disabled={busy||!files.length} data-testid="hash-baseline-export" onClick={()=>void integrityAction("create")}>生成并保存基准 JSON</button>
    <button type="button" disabled={busy||!files.length||!baseline.trim()} data-testid="hash-verify" onClick={()=>void integrityAction("verify")}>与基准比对</button>
   </div>
   <label className="field-label">导入基准 JSON<input className="field" type="file" accept=".json,application/json" data-testid="hash-baseline-file" onChange={e=>void selectManifest(e)}/></label>
   <label className="field-label">基准内容（可从别处粘贴）<textarea className="field text-editor" rows={5} maxLength={150000} data-testid="hash-baseline-text" value={baseline} onChange={e=>{setBaseline(e.target.value);setChecks([]);}}/></label>
   {checks.length>0&&<div data-testid="hash-check-results">{checks.map(x=><p key={x.name}>{x.name}: <strong>{x.state}</strong></p>)}</div>}
  </>}
  {mode==="csv-key-audit"&&<>
   <h3>CSV 关键列重复与冲突审计</h3>
   <p className="subtle">可选一个或两个关键字段。区分完全重复记录和同一编号下的数据冲突，不自动删除任何行。导出 ZIP 包含重复键相关行和审计 JSON；CSV 公式样式文本会作安全处理。</p>
   <label className="field-label">导入 CSV<input className="field" type="file" accept=".csv,text/csv" data-testid="csv-audit-file" onChange={e=>void openCsv(e)}/></label>
   <label className="field-label">CSV 内容<textarea className="field text-editor" data-testid="csv-audit-text" rows={7} maxLength={1000000} value={csv} onChange={e=>setCsv(e.target.value)}/></label>
   <div className="tools-pair">
    <label className="field-label">主要关键列<select className="field" data-testid="csv-audit-key1" value={key1} onChange={e=>setKey1(e.target.value)}>{parsed.headers.map((s,i)=><option value={i} key={i}>{s||"(empty)"} — {i+1}</option>)}</select></label>
    <label className="field-label">第二关键列（可不选）<select className="field" data-testid="csv-audit-key2" value={key2} onChange={e=>setKey2(e.target.value)}><option value="">不使用第二列</option>{parsed.headers.map((s,i)=><option value={i} key={i}>{s||"(empty)"} — {i+1}</option>)}</select></label>
   </div>
   {review.error?<p role="alert" className="subtle">{review.error}</p>:review.audit&&<>
    <p data-testid="csv-audit-stats">总数据行 {review.audit.totalRows} · 重复键组 {review.audit.groups.length} · 冲突组 {review.audit.conflictingGroups} · 空白关键字段行 {review.audit.blankKeys.length}</p>
    <div style={{maxHeight:240,overflowY:"auto"}}>{review.audit.groups.slice(0,20).map((g,i)=><p key={i}>键 {g.key.join(" / ")} · 行 {g.rowNumbers.join(", ")} · {g.conflict?"内容冲突":"完全重复"}</p>)}</div>
   </>}
   <button className="primary-button" type="button" disabled={busy||!!review.error} data-testid="csv-audit-export" onClick={()=>void saveCsvAudit()}>导出完整冲突审计 ZIP</button>
  </>}
  {status&&<p className="subtle" role="status" data-testid="next-wave-status">{status}</p>}
  <p className="subtle">Offline and user-initiated. Source files are never overwritten, uploaded or continuously monitored.</p>
 </section>;
}
