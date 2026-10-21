import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {inspectCsvKeys,exportCsvDuplicateAudit} from "../lib/csvDuplicateAudit";
import {parseWorkspaceCsv} from "../lib/csvCleanroom";
const fail=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function NextWaveDesk(){
 const [csv,setCsv]=useState("StudentID,Name,Score\n001,Alice,90\n002,Bob,80\n001,Alice,92");
 const [key1,setKey1]=useState("0"),[key2,setKey2]=useState("");
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const columns=useMemo(()=>{try{return parseWorkspaceCsv(csv)[0]??[];}catch{return [];}},[csv]);
 const keys=[Number(key1),...(key2===""?[]:[Number(key2)])];
 const review=useMemo(()=>{try{return {audit:inspectCsvKeys(csv,keys),error:""};}
  catch(e){return {audit:null,error:fail(e)};}},[csv,key1,key2]);
 async function openCsv(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";if(!file)return;
  try{
   if(!/\.csv$/iu.test(file.name)||file.size>1000000)throw Error("Choose a CSV file at most 1 MB.");
   const text=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
   parseWorkspaceCsv(text);setCsv(text);setKey1("0");setKey2("");
   setStatus("Imported "+file.name+" locally.");
  }catch(err){setStatus("CSV import: "+fail(err));}
 }
 async function save(){
  if(busy)return;setBusy(true);setStatus("");
  try{
   const {zip,audit}=await exportCsvDuplicateAudit(csv,keys);
   const ok=await exportFile("sentinel-box-csv-duplicate-audit.zip",zip);
   setStatus(ok?"Saved "+audit.groups.length+" duplicate-key groups. Original file unchanged.":"Save cancelled.");
  }catch(err){setStatus("CSV audit: "+fail(err));}finally{setBusy(false);}
 }
 return <section className="panel" data-testid="next-wave-desk">
  <p className="eyebrow">SENTINEL BOX · DATA QUALITY</p>
  <h3>CSV 关键列重复与冲突审计</h3>
  <p className="subtle">检查一或两个关键列，分别报告完全重复的记录及相同键下内容冲突的记录；与两份 CSV 的版本差异工具不同。输出 ZIP 包含原始行号、公式安全的 CSV 副本与 JSON 报告。不会删除任何行。</p>
  <label className="field-label">导入 CSV<input className="field" type="file" accept=".csv,text/csv" data-testid="csv-audit-file" onChange={e=>void openCsv(e)}/></label>
  <label className="field-label">CSV 内容<textarea className="field text-editor" data-testid="csv-audit-text" rows={8} maxLength={1000000} value={csv} onChange={e=>setCsv(e.target.value)}/></label>
  <div className="tools-pair">
   <label className="field-label">主要关键列<select className="field" data-testid="csv-audit-key1" value={key1} onChange={e=>setKey1(e.target.value)}>{columns.map((x,i)=><option value={i} key={i}>{x||"(empty)"} — {i+1}</option>)}</select></label>
   <label className="field-label">第二关键列（可不选）<select className="field" data-testid="csv-audit-key2" value={key2} onChange={e=>setKey2(e.target.value)}><option value="">不使用第二列</option>{columns.map((x,i)=><option value={i} key={i}>{x||"(empty)"} — {i+1}</option>)}</select></label>
  </div>
  {review.error?<p role="alert" className="subtle">{review.error}</p>:review.audit&&<>
   <p data-testid="csv-audit-stats">总数据行 {review.audit.totalRows} · 重复键组 {review.audit.groups.length} · 冲突组 {review.audit.conflictingGroups} · 空白关键字段行 {review.audit.blankKeys.length}</p>
   <div style={{maxHeight:250,overflowY:"auto"}}>{review.audit.groups.slice(0,20).map((g,i)=><p key={i}>键 {g.key.join(" / ")} · 行 {g.rowNumbers.join(", ")} · {g.conflict?"内容冲突":"完全重复"}</p>)}</div>
  </>}
  <button className="primary-button" type="button" disabled={busy||!!review.error} data-testid="csv-audit-export" onClick={()=>void save()}>导出冲突审计 ZIP</button>
  {status&&<p className="subtle" role="status" data-testid="next-wave-status">{status}</p>}
  <p className="subtle">本机主动处理，无自动扫描、网络传输或覆盖原文件。</p>
 </section>;
}
