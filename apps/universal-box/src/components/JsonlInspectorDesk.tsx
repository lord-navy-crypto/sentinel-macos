import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {
 parseLocalJsonl,jsonlLevelCounts,filterJsonl,exportJsonlCsv,JSONL_MAX_BYTES,
 type JsonlReport,type LogLevel,
} from "../lib/jsonlInspector";

export default function JsonlInspectorDesk(){
 const [report,setReport]=useState<JsonlReport|null>(null);
 const [fileName,setFileName]=useState("");
 const [level,setLevel]=useState<LogLevel|"all">("all");
 const [query,setQuery]=useState("");
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const selected=useMemo(()=>report?filterJsonl(report.records,level,query):[],[report,level,query]);
 const counts=useMemo(()=>report?jsonlLevelCounts(report):[],[report]);

 async function load(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";
  if(files.length!==1){if(files.length)setStatus("一次请选择一份 JSONL/NDJSON 日志文件。");return;}
  const file=files[0];
  if(busy)return;
  if(!/\.(jsonl|ndjson|log|txt)$/iu.test(file.name)||file.size<1||file.size>JSONL_MAX_BYTES){
   setStatus("请选择 1–2 MB 的 JSONL/NDJSON/LOG/TXT 文件；之前的报告不变。");return;
  }
  setBusy(true);setStatus("");
  try{
   const data=new Uint8Array(await file.arrayBuffer());
   const decoded=new TextDecoder("utf-8",{fatal:true}).decode(data);
   const parsed=parseLocalJsonl(decoded,file.size);
   setReport(parsed);setFileName(file.name);setLevel("all");setQuery("");
   setStatus("已在本机处理 "+parsed.records.length+" 行，其中 "+parsed.invalidCount+" 行无效；无效行保留在报告中。");
  }catch(error){
   setStatus("无法导入该日志，之前的报告已保留："+String(error instanceof Error?error.message:error));
  }finally{setBusy(false);}
 }
 async function save(){
  if(!selected.length||busy)return;
  setBusy(true);setStatus("");
  try{
   const data=exportJsonlCsv(selected);
   const saved=await exportFile("sentinel-jsonl-report.csv",data);
   setStatus(saved?"已导出当前筛选下全部 "+selected.length+" 行（含原始 JSONL 内容）到 CSV。":"保存已取消，日志报告未改变。");
  }catch(error){setStatus("导出失败："+String(error instanceof Error?error.message:error));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="jsonl-inspector">
  <p className="eyebrow">SENTINEL BOX · OFFLINE STRUCTURED LOGS</p>
  <h2>JSONL / NDJSON 日志查看器</h2>
  <p className="subtle">查看软件、自动化或数据处理工具生成的逐行 JSON 日志，按错误级别和关键词筛选，导出 CSV。普通 JSON 格式化器处理一整个 JSON；本工具专门处理<strong>每行一个对象</strong>的文件。</p>
  <label className="field-label">选择本地 .jsonl / .ndjson / .log / .txt（UTF-8，≤2 MB，≤5,000 行）
   <input type="file" data-testid="jsonl-file" className="field" disabled={busy}
    accept=".jsonl,.ndjson,.log,.txt" onChange={event=>void load(event)}/>
  </label>
  <p className="subtle">只在选文件时读取，完全离线。不自动扫描日志目录；日志可能含密钥、账号或个人信息，导出 CSV 时会保留原始整行内容，请勿随意公开分享。</p>
  {report&&<>
   <div className="metrics" data-testid="jsonl-stats">
    <span>文件：{fileName}</span><span>全部行数：{report.records.length}</span>
    <span>无效行：{report.invalidCount}</span><span>原文件：{report.bytes.toLocaleString()} bytes</span>
   </div>
   <div className="task-list" data-testid="jsonl-level-counts">
    {counts.map(item=><div className="task-row" key={item.level}>
     <span className="task-copy">{item.level} · {item.count} 行</span>
    </div>)}
   </div>
   <div className="tools-pair">
    <label className="field-label">日志等级
     <select className="field" data-testid="jsonl-level" value={level}
      onChange={e=>setLevel(e.target.value as LogLevel|"all")}>
      <option value="all">全部等级</option>
      {(["fatal","error","warn","info","debug","trace","other","invalid"] as const).map(item=>
       <option value={item} key={item}>{item}</option>)}
     </select>
    </label>
    <label className="field-label">本地搜索消息、字段或值
     <input className="field" data-testid="jsonl-search" value={query} maxLength={200}
      onChange={e=>setQuery(e.target.value)} placeholder="如 timeout、requestId 或报错信息"/>
    </label>
   </div>
   <p data-testid="jsonl-visible-count" className="subtle">当前筛选：{selected.length} 行；下面只预览前 100 行，导出会包含所有筛选结果。无效行可选 invalid 筛选查看，绝不静默删除。</p>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="jsonl-export"
     disabled={busy||!selected.length} onClick={()=>void save()}>导出当前筛选 CSV</button>
    <button type="button" className="secondary-button" data-testid="jsonl-reset-filter"
     disabled={busy} onClick={()=>{setQuery("");setLevel("all");}}>重置筛选</button>
    <button type="button" className="secondary-button" data-testid="jsonl-clear"
     disabled={busy} onClick={()=>{setReport(null);setQuery("");setLevel("all");setFileName("");setStatus("已从窗口清空日志；原文件未修改。");}}>清空日志</button>
   </div>
   <div className="task-list" data-testid="jsonl-preview">
    {selected.slice(0,100).map(row=><div className="task-row" key={row.line}>
     <span className="task-copy">第 {row.line} 行 · {row.level} · {row.timestamp} · {row.valid?(row.message||row.raw):"无效 JSON："+row.raw}</span>
    </div>)}
   </div>
  </>}
  {status&&<p className="subtle" role="status" data-testid="jsonl-status">{status}</p>}
 </section>;
}
