import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {
 parseOfflineFeedXml,uniqueFeedEntries,filterFeedEntries,feedDomainCounts,
 feedArchiveCsv,feedArchiveMarkdown,FEED_MAX_INPUT_BYTES,type FeedArchive,
} from "../lib/offlineFeedArchive";

function detail(error:unknown):string{return error instanceof Error?error.message:String(error);}
export default function OfflineFeedArchiveDesk(){
 const [archive,setArchive]=useState<FeedArchive|null>(null);
 const [fileName,setFileName]=useState("");
 const [search,setSearch]=useState("");
 const [dedupe,setDedupe]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const exported=useMemo(()=>!archive?[]:dedupe?uniqueFeedEntries(archive.entries):archive.entries,
  [archive,dedupe]);
 const shown=useMemo(()=>filterFeedEntries(exported,search).slice(0,80),[exported,search]);
 const domains=useMemo(()=>feedDomainCounts(exported).slice(0,10),[exported]);
 async function importArchive(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  if(!files.length||busy)return;
  if(files.length!==1){setStatus("一次只能选择一个离线订阅文件，旧档案仍然保留。");return;}
  const file=files[0];
  if(!/\.(?:rss|atom|xml)$/iu.test(file.name)||file.size<10||file.size>FEED_MAX_INPUT_BYTES){
   setStatus("请选择 10 bytes–2 MB 的 RSS / Atom / XML 导出文件；之前的结果未改变。");return;
  }
  setBusy(true);setStatus("");
  try{
   const bytes=await file.arrayBuffer();
   const xml=new TextDecoder("utf-8",{fatal:true}).decode(bytes).replace(/^\uFEFF/u,"");
   const parsed=parseOfflineFeedXml(xml);
   setArchive(parsed);setFileName(file.name);setSearch("");setDedupe(false);
   setStatus("已离线读取 "+parsed.entries.length+" 条有效文章链接；另有 "+parsed.skipped+
    " 条不支持的链接。没有访问订阅源或文章地址。");
  }catch(error){setStatus("导入失败，旧档案仍可使用："+detail(error));}
  finally{setBusy(false);}
 }
 async function download(format:"csv"|"md"){
  if(!archive||busy)return;
  setBusy(true);setStatus("");
  try{
   const name=format==="csv"?"sentinel-feed-archive.csv":"sentinel-feed-archive.md";
   const content=format==="csv"?feedArchiveCsv(exported):feedArchiveMarkdown(archive,exported);
   const saved=await exportFile(name,content);
   setStatus(saved?"已导出 "+exported.length+" 条离线订阅条目，原始文件未修改。":"已取消保存；当前档案仍在。");
  }catch(error){setStatus("导出失败："+detail(error));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="offline-feed-archive">
  <p className="eyebrow">SENTINEL BOX · CLASSIC UTILITY ROADMAP · OFFLINE READING</p>
  <h2>离线 RSS / Atom 订阅档案</h2>
  <p className="subtle">打开已经保存的 RSS 2.0 或 Atom 1.0 XML 文件，整理文章标题、网址和日期，按网站统计、检索与导出。不会订阅、抓取、打开文章，也不会渲染文件中的 HTML、图片或样式。</p>
  <label className="field-label">选择一个本地 .rss / .atom / .xml 文件（≤2 MB，最多 1,000 条）
   <input type="file" className="field" data-testid="feed-import" accept=".rss,.atom,.xml,text/xml,application/xml"
    disabled={busy} onChange={event=>void importArchive(event)}/>
  </label>
  <p className="subtle">只处理用户选择的 UTF-8 文件和 HTTP(S) 文章链接；禁止 DTD、外部实体、带账户密码的网址。旧文件导入失败会保留之前的结果。输出中可能含您的个人订阅内容，分享前请检查。</p>
  {archive&&<>
   <div className="metrics" data-testid="feed-stats">
    <span>来源：{fileName}</span><span>标题：{archive.sourceTitle}</span>
    <span>{archive.format}</span><span>条目：{archive.entries.length}</span>
    <span>重复 URL：{archive.duplicates}</span><span>跳过：{archive.skipped}</span>
   </div>
   <label className="field-label">
    <input type="checkbox" data-testid="feed-dedupe" checked={dedupe}
     onChange={e=>setDedupe(e.target.checked)}/> 导出时按完整网址去重（默认保留所有，源文件不变）
   </label>
   <p className="subtle" data-testid="feed-export-count">当前导出 {exported.length} 条；筛选只影响屏幕预览，不影响完整导出。</p>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="feed-export-csv"
     disabled={busy} onClick={()=>void download("csv")}>导出 CSV</button>
    <button type="button" className="secondary-button" data-testid="feed-export-md"
     disabled={busy} onClick={()=>void download("md")}>导出 Markdown</button>
    <button type="button" className="secondary-button" data-testid="feed-clear"
     disabled={busy} onClick={()=>{setArchive(null);setFileName("");setSearch("");setDedupe(false);
      setStatus("已清空本次导入的条目；原始 XML 未更改。");}}>清空档案</button>
   </div>
   <h3>常见来源网站</h3>
   <div className="task-list" data-testid="feed-domains">
    {domains.map(d=><div className="task-row" key={d.domain}>
     <span className="task-copy">{d.domain} · {d.count} 条</span></div>)}
   </div>
   <label className="field-label">筛选标题、网址或摘要（只影响预览）
    <input type="search" className="field" data-testid="feed-search" maxLength={200}
     value={search} onChange={e=>setSearch(e.target.value)} placeholder="例如 release notes、开源、example.com"/>
   </label>
   <p className="subtle">屏幕显示筛选后的前 80 条，导出仍包含全部有效条目，不会因搜索而漏项。</p>
   <div className="task-list" data-testid="feed-rows">
    {shown.map((item,i)=><div className="task-row" key={i}>
     <span className="task-copy"><strong>{item.title}</strong> · {item.date} · {item.domain} · {item.url}
      {item.summary&&<span> · {item.summary}</span>}</span>
    </div>)}
   </div>
  </>}
  {status&&<p role="status" className="subtle" data-testid="feed-status">{status}</p>}
 </section>;
}
