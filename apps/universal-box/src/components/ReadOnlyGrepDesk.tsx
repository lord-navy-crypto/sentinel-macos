import {useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {
 validateGrepFiles,runReadOnlyGrep,exportGrepCsv,
 GREP_MAX_FILES,GREP_MAX_FILE_BYTES,GREP_MAX_TOTAL_BYTES,
 type GrepSource,type GrepReport,
} from "../lib/readOnlyGrep";

const errText=(error:unknown)=>error instanceof Error?error.message:String(error);
export default function ReadOnlyGrepDesk(){
 const [files,setFiles]=useState<GrepSource[]>([]);
 const [query,setQuery]=useState("");
 const [caseSensitive,setCaseSensitive]=useState(false);
 const [report,setReport]=useState<GrepReport|null>(null);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 async function importFiles(event:ChangeEvent<HTMLInputElement>){
  const chosen=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  if(busy||!chosen.length)return;
  setBusy(true);setStatus("");
  try{
   if(chosen.length>GREP_MAX_FILES)throw Error("Select up to 20 files.");
   let totalBytes=0;
   const sources:GrepSource[]=[];
   for(const file of chosen){
    // Check size before allocation or text decoding.
    if(file.size<1||file.size>GREP_MAX_FILE_BYTES)
     throw Error("Each file must be 1–200,000 bytes: "+file.name);
    totalBytes+=file.size;
    if(totalBytes>GREP_MAX_TOTAL_BYTES)
     throw Error("Files exceed the 2 MB aggregate limit.");
    if(!/\.(?:txt|md|markdown|csv|tsv|json|jsonl|ndjson|srt|vtt|log)$/iu.test(file.name))
     throw Error("Only TXT, MD, CSV, TSV, JSON, JSONL, SRT, VTT or LOG are supported: "+file.name);
    const decoded=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/u,"");
    sources.push({name:file.name,bytes:file.size,text:decoded});
   }
   validateGrepFiles(sources);
   setFiles(sources);setReport(null);
   setStatus("已只读载入 "+sources.length+" 份本地 UTF-8 文本；请输入关键词并点击搜索。");
  }catch(error){
   setStatus("文件导入被拒绝，之前的文件与搜索结果仍保留："+errText(error));
  }finally{setBusy(false);}
 }
 function performSearch(){
  if(busy)return;
  try{
   const output=runReadOnlyGrep(files,query,caseSensitive);
   setReport(output);
   setStatus("只读搜索完成："+output.matches.length+" 行匹配，已扫描 "+output.totalFiles+" 个选定文件，没有修改任何原文件。");
  }catch(error){
   setReport(null);setStatus("搜索未完成："+errText(error));
  }
 }
 async function save(){
  if(!report||busy)return;
  setBusy(true);setStatus("");
  try{
   const downloaded=await exportFile("sentinel-multifile-search.csv",exportGrepCsv(report));
   setStatus(downloaded?"已导出全部 "+report.matches.length+" 行真实匹配；所有原文件保持不变。":"已取消保存，搜索结果仍在。");
  }catch(error){setStatus("无法导出 CSV："+errText(error));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="grep-desk">
  <p className="eyebrow">SENTINEL BOX · CLASSIC UTILITY ROADMAP · PHASE 2</p>
  <h2>多文件只读内容搜索 · Grep-style Search</h2>
  <p className="subtle">从电脑上主动选择最多 20 个文本文件，输入普通关键词，按文件和<strong>原始行号</strong>查看匹配内容。这里不是批量替换工具：<strong>绝不写回、重命名或删除源文件。</strong></p>
  <label className="field-label">选择 1–20 份本地 UTF-8 文本（单份 ≤200 KB，总计 ≤2 MB）
   <input className="field" type="file" multiple disabled={busy} data-testid="grep-files"
    accept=".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.ndjson,.srt,.vtt,.log"
    onChange={event=>void importFiles(event)}/>
  </label>
  <p className="subtle">只查找用户选择的文件，不索引整个磁盘，不运行正则表达式，不后台监控。任何一个文件不符合要求时整批拒绝，不会悄悄跳过。源代码、配置和日志可能包含私密信息，分享 CSV 之前请先核对。</p>
  {files.length>0&&<>
   <div className="metrics" data-testid="grep-stats">
    <span>已载入 {files.length} 个文件</span>
    <span>{files.reduce((sum,item)=>sum+item.bytes,0).toLocaleString()} bytes</span>
    <span>内容仅保存在当前窗口内存</span>
   </div>
   <label className="field-label">搜索完整关键词（字面匹配，最长 120 字符）
    <input className="field" type="search" maxLength={120} data-testid="grep-query" value={query}
     onChange={e=>{setQuery(e.target.value);setReport(null);}} placeholder="例如 TODO、warning、发票"/>
   </label>
   <label className="field-label">
    <input type="checkbox" data-testid="grep-case" checked={caseSensitive}
     onChange={event=>{setCaseSensitive(event.target.checked);setReport(null);}}/> 区分大小写
   </label>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="grep-search"
     disabled={busy||!query.trim()} onClick={performSearch}>搜索选定文件</button>
    <button type="button" className="secondary-button" data-testid="grep-export"
     disabled={busy||!report} onClick={()=>void save()}>导出全部结果 CSV</button>
    <button type="button" className="secondary-button" data-testid="grep-clear"
     disabled={busy} onClick={()=>{setFiles([]);setQuery("");setReport(null);setStatus("清空了当前会话中的文本；原始磁盘文件没有改变。");}}>清空会话</button>
   </div>
   {report&&<>
    <p className="subtle" data-testid="grep-count">
     匹配 {report.matches.length} 行 · 扫描 {report.totalLines.toLocaleString()} 行 · {report.totalFiles} 个文件。
     页面仅展示前 100 行，CSV 包含全部真实匹配行；超过 5,000 行会拒绝生成不完整报告，请缩小关键词范围。
    </p>
    <div className="task-list" data-testid="grep-perfile">
     {report.files.map((item,index)=><div key={index} className="task-row">
      <span className="task-copy">{index+1}. {item.name} · {item.matchedLines} 行匹配</span>
     </div>)}
    </div>
    <div className="task-list" data-testid="grep-matches">
     {report.matches.slice(0,100).map((item,index)=><div key={index} className="task-row">
      <span className="task-copy">{item.file} · 第 {item.line} 行 · {item.snippet}</span>
     </div>)}
    </div>
   </>}
  </>}
  {status&&<p role="status" className="subtle" data-testid="grep-status">{status}</p>}
 </section>;
}
