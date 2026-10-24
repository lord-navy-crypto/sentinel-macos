import {useEffect,useMemo,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {exportFile} from "../lib/output";
import {sentinelTable,sentinelSummary,sentinelCsv,filteredSentinelRows,sentinelDiff} from "../lib/sentinelPresentation";
import {quickCheckMetrics,reviewQueueMetrics} from "../lib/sentinelDashboard";
import {projectSentinelGraph} from "../lib/sentinelGraph";
import SentinelGraphView from "./SentinelGraphView";
import {projectSentinelTimeline} from "../lib/sentinelTimeline";
import SentinelTimelineView from "./SentinelTimelineView";

type EngineStatus = {running:boolean;version:string|null;message:string};
type ReadOperation = {id:string;name:string;description:string};
type Lens = {id:string;title:string;subtitle:string;reads:ReadOperation[]};
const LENSES:Lens[] = [
 {id:"overview",title:"系统概览",subtitle:"真实系统状态、快速检查和审查队列",reads:[
  {id:"overview",name:"系统总览",description:"Sentinel 原生系统观测"},
  {id:"profile",name:"设备信息",description:"系统配置与运行环境"},
  {id:"quick-check",name:"Easy Scan",description:"现时系统证据，不执行清理"},
  {id:"review",name:"Review Queue",description:"待审查的证据"}]},
 {id:"investigate",title:"证据调查",subtitle:"复用 Sentinel 原始图谱与时间线数据",reads:[
  {id:"graph",name:"Evidence Graph",description:"关联图原始证据"},
  {id:"timeline",name:"Timeline",description:"已记录的时间线"}]},
 {id:"compare",title:"变化和信任",subtitle:"已有基线和历史，不新建基线",reads:[
  {id:"behavior",name:"Behavior",description:"系统行为观测"},
  {id:"trust",name:"Reference Status",description:"参考基线状态"}]},
 {id:"system",title:"Mac 系统与网络",subtitle:"进程、启动项、后台任务、网络及存储",reads:[
  {id:"processes",name:"Processes",description:"真实进程信息"},
  {id:"startup",name:"Startup Items",description:"启动项与登录项目"},
  {id:"background",name:"Background",description:"后台登记信息"},
  {id:"network",name:"Network",description:"网络连接概览"},
  {id:"network-history",name:"Network History",description:"已保留的网络历史"},
  {id:"storage",name:"Storage History",description:"存储年龄分布"}]},
 {id:"actions",title:"安全操作与恢复",subtitle:"所有修改操作仍由原 Sentinel 引擎验证",reads:[
  {id:"doctor",name:"System Doctor",description:"只读诊断与安全边界"}]},
 {id:"limits",title:"权限、运行状态与 AI",subtitle:"权限可见性及引擎运行记录",reads:[
  {id:"capabilities",name:"Capabilities",description:"探测功能与可见性"},
  {id:"visibility",name:"Visibility",description:"系统权限可见范围"},
  {id:"runtime-logs",name:"Runtime Logs",description:"引擎的运行记录"}]},
];

function prettyJson(value:unknown):string {
 try {return JSON.stringify(value,null,2)??String(value);} catch{return String(value);}
}
export default function SentinelCenter({initialLens="overview",initialRead="",onSendToTables,onSendToPrivacy}:{initialLens?:string;initialRead?:string;onSendToTables:(csv:string)=>void;onSendToPrivacy:(text:string)=>void}){
 const [lens,setLens]=useState(()=>LENSES.some(x=>x.id===initialLens)?initialLens:"overview");
 const [engine,setEngine]=useState<EngineStatus|null>(null);
 const [working,setWorking]=useState(false);
 const [selected,setSelected]=useState<ReadOperation|null>(()=>LENSES.flatMap(x=>x.reads).find(x=>x.id===initialRead)??null);
 const [result,setResult]=useState<unknown>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);
 const [previous,setPrevious]=useState<unknown>(null);
 const [query,setQuery]=useState("");
 const [sortColumn,setSortColumn]=useState("");
 const [descending,setDescending]=useState(false);
 const [presentation,setPresentation]=useState<"table"|"json"|"compare"|"graph"|"timeline">("table");
 const [exportMessage,setExportMessage]=useState("");
 const [dashboard,setDashboard]=useState<{quick:unknown;queue:unknown}|null>(null);
 const [dashboardLoading,setDashboardLoading]=useState(false);
 const [dashboardError,setDashboardError]=useState("");
 const [searchQuery,setSearchQuery]=useState("");
 const group=useMemo(()=>LENSES.find(x=>x.id===lens)??LENSES[0],[lens]);
 const table=useMemo(()=>sentinelTable(result),[result]);
 const graph=useMemo(()=>projectSentinelGraph(result),[result]);
 const timeline=useMemo(()=>projectSentinelTimeline(result),[result]);
 const filtered=useMemo(()=>table?filteredSentinelRows(table,query,sortColumn,descending):[],[table,query,sortColumn,descending]);
 const changes=useMemo(()=>previous===null?[]:sentinelDiff(previous,result),[previous,result]);
 const summary=useMemo(()=>sentinelSummary(result),[result]);
 async function searchSentinel(){
  const term=searchQuery.trim();
  if(!term||term.length>120)return;
  setLoading(true);setError("");setExportMessage("");
  setPrevious(selected?.name==="Sentinel 搜索："+term?result:null);
  setSelected({id:"search",name:"Sentinel 搜索："+term,description:"原 Go 引擎搜索结果"});
  setResult(null);setPresentation("table");setQuery("");setSortColumn("");
  try{setResult(await invoke<unknown>("sentinel_service_search",{query:term}));}
  catch(e){setError(String(e));}
  finally{setLoading(false);}
 }
 async function loadDashboard(){
  setDashboardLoading(true);setDashboardError("");
  try{
   const [quick,queue]=await Promise.all([
    invoke<unknown>("sentinel_service_read",{key:"quick-check"}),
    invoke<unknown>("sentinel_service_read",{key:"review"}),
   ]);
   setDashboard({quick,queue});
  }catch(e){setDashboardError(String(e));}
  finally{setDashboardLoading(false);}
 }
 function sendToTable(){
  if(!table){setExportMessage("此结果没有可以送入表格工具的记录。");return;}
  const csv=sentinelCsv(table,filtered);
  if(csv.length>1_500_000){setExportMessage("数据超出 1.5 MB 安全上限；请筛选后再传输。");return;}
  onSendToTables(csv);
 }
 function sendToCleaner(){
  if(result===null){setExportMessage("没有可发送的诊断数据。");return;}
  const text=prettyJson(result);
  if(text.length>200_000){setExportMessage("超过 200,000 字符限制；请先在 Sentinel 工具中选取更小的结果。");return;}
  onSendToPrivacy(text);
 }
 async function exportReading(format:"json"|"csv"){
  if(!selected||result===null)return;
  try{
   const body=format==="json"?prettyJson(result):table?sentinelCsv(table,filtered):"";
   if(!body){setExportMessage("当前结果不包含表格行，请改用 JSON 导出。");return;}
   const saved=await exportFile("sentinel-"+selected.id+"."+format,body);
   setExportMessage(saved?"文件已保存在本机":"已取消保存");
  }catch(e){setExportMessage("保存失败："+String(e));}
 }
 useEffect(()=>{
  let live=true;
  void invoke<EngineStatus>("sentinel_service_status")
   .then(x=>{if(live)setEngine(x);})
   .catch(e=>{if(live)setError(String(e));});
  return ()=>{live=false;};
 },[]);
 async function start(){
  setWorking(true);setError("");
  try {setEngine(await invoke<EngineStatus>("sentinel_service_start"));}
  catch(e){setError(String(e));}
  finally{setWorking(false);}
 }
 async function stop(){
  setWorking(true);setError("");
  try {
   setEngine(await invoke<EngineStatus>("sentinel_service_stop"));
   setResult(null);setSelected(null);setPrevious(null);setDashboard(null);
  }catch(e){setError(String(e));}
  finally{setWorking(false);}
 }
 async function openFull(){
  setWorking(true);setError("");
  try{await invoke("sentinel_service_full_workbench");}
  catch(e){setError(String(e));}
  finally{setWorking(false);}
 }
 async function read(item:ReadOperation){
  setLoading(true);setError("");setExportMessage("");
  const wasSame=selected?.id===item.id;
  setPrevious(wasSame?result:null);
  setSelected(item);setResult(null);
  setQuery("");setSortColumn("");setPresentation("table");
  try{const data=await invoke<unknown>("sentinel_service_read",{key:item.id});setResult(data);if(projectSentinelGraph(data))setPresentation("graph");else if(projectSentinelTimeline(data))setPresentation("timeline");}
  catch(e){setError(String(e));}
  finally{setLoading(false);}
 }
 return <section className="panel" aria-label="Sentinel Mac System Center">
  <p className="eyebrow">SENTINEL · ORIGINAL GO SYSTEM WORKBENCH</p>
  <h2>Sentinel · Mac 系统中心</h2>
  <p className="subtle">原 Sentinel Go 引擎作为内置服务运行。历史记录、证据分析、权限、安全操作和恢复逻辑都保留在原引擎，不重新实现。</p>
  <div style={{padding:14,borderRadius:12,border:"1px solid var(--line, #cbd5e1)"}}>
   <strong>引擎状态：{engine?.running?"已连接":engine?"未启动":"检测中"}</strong>
   <p className="subtle">{engine?.message??"检查本地引擎状态…"}{engine?.version?" · v"+engine.version:""}</p>
   <div className="actions">
    <button type="button" className="primary-button" disabled={working||engine?.running} onClick={()=>void start()}>启动内置 Sentinel Go 服务</button>
    <button type="button" className="secondary-button" disabled={working||!engine?.running} onClick={()=>void openFull()}>打开完整 Sentinel 工作台</button>
    <button type="button" className="secondary-button" disabled={working||!engine?.running} onClick={()=>void stop()}>安全停止服务</button>
   </div>
   <p className="subtle">启动仅开启本机服务，不会自动运行完整扫描。完整工作台在 Sentinel Box 内另开同一应用的 WebView 窗口，原 Sentinel 操作与确认流程保持不变。</p>
  </div>
  <form onSubmit={e=>{e.preventDefault();void searchSentinel();}} style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end",marginTop:14}}>
   <label style={{flex:"1 1 260px"}}>Sentinel 全局证据搜索
    <input type="search" className="field" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
     maxLength={120} placeholder="搜索本机进程、服务和已有 Sentinel 证据…" />
   </label>
   <button className="primary-button" type="submit" disabled={!engine?.running||loading||!searchQuery.trim()}>使用原 Go 引擎搜索</button>
  </form>
  {error&&<p role="alert" style={{whiteSpace:"pre-wrap"}}>{error}</p>}
  <div style={{marginTop:16,marginBottom:16}}>
   <div className="actions">
    <button className="secondary-button" type="button" disabled={!engine?.running||dashboardLoading} onClick={()=>void loadDashboard()}>
     {dashboardLoading?"读取 Sentinel 系统摘要中…":"加载 Quick Check + Review Queue"}
    </button>
   </div>
   {dashboardError&&<p role="alert">系统摘要读取失败：{dashboardError}</p>}
   {dashboard&&<div>
    <h3>Sentinel 实时系统摘要</h3>
    <p className="subtle">数值全部来自原 Go 引擎，仅用于排列审查优先级。Attention 不是恶意软件概率。</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10}}>
     {[...quickCheckMetrics(dashboard.quick),...reviewQueueMetrics(dashboard.queue)].map((metric,i)=>
      <div key={metric.label+i} style={{padding:14,border:"1px solid var(--line, #cbd5e1)",borderRadius:12}}>
       <div className="subtle" style={{fontSize:12}}>{metric.label}</div>
       <div style={{fontSize:22,fontWeight:700}}>{metric.value}</div>
       {metric.detail&&<div className="subtle" style={{fontSize:11}}>{metric.detail}</div>}
      </div>)}
    </div>
   </div>}
  </div>
  <div className="pill-row" role="group" aria-label="Sentinel modules">
   {LENSES.map(x=><button key={x.id} type="button" className={lens===x.id?"pill active-pill":"pill"} onClick={()=>{setLens(x.id);setSelected(null);setResult(null);setPrevious(null);setError("");}}>{x.title}</button>)}
  </div>
  <div style={{marginTop:16}}>
   <h3>{group.title}</h3><p className="subtle">{group.subtitle}</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
    {group.reads.map(item=><button type="button" key={item.id}
      className="secondary-button" style={{padding:14,textAlign:"left",minHeight:90}}
      disabled={!engine?.running||loading} onClick={()=>void read(item)}>
      <strong>{item.name}</strong><span className="subtle" style={{display:"block",marginTop:6,fontSize:12}}>{item.description}</span>
     </button>)}
   </div>
  </div>
  {selected&&<div className="panel" style={{marginTop:16}}>
   {result===null&&!loading&&<p className="subtle">该功能已定位到原 Go 引擎中的「{selected.name}」。启动服务后点击「读取/刷新」才会查询真实系统数据；不会只展示演示内容。</p>}
   <h3>{selected.name} · 来自原 Sentinel Go 引擎</h3>
   <div className="actions">
    <button type="button" className="secondary-button" disabled={loading||!engine?.running} onClick={()=>void (selected.id==="search"?searchSentinel():read(selected))}>刷新并比较</button>
    <button type="button" className="secondary-button" disabled={loading||result===null} onClick={()=>void exportReading("json")}>导出原始 JSON</button>
    <button type="button" className="secondary-button" disabled={loading||!table} onClick={()=>void exportReading("csv")}>导出筛选结果 CSV</button>
    <button type="button" className="secondary-button" disabled={loading||!table} onClick={sendToTable}>在 Universal Box 表格工具中打开</button>
    <button type="button" className="secondary-button" disabled={loading||result===null} onClick={sendToCleaner}>发送到本地日志隐私清理</button>
   </div>
   {exportMessage&&<p role="status" className="subtle">{exportMessage}</p>}
   {loading?<p role="status">正在从原 Sentinel API 读取…</p>:result!==null?<>
    {summary.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginTop:12}}>
     {summary.map(item=><div key={item.name} style={{border:"1px solid var(--line, #cbd5e1)",borderRadius:10,padding:12}}>
      <div className="subtle" style={{fontSize:12,overflowWrap:"anywhere"}}>{item.name}</div>
      <strong style={{overflowWrap:"anywhere"}}>{item.value}</strong>
     </div>)}
    </div>}
    <div className="actions" role="group" aria-label="Result presentation mode" style={{marginTop:12}}>
     {graph&&<button type="button" className="secondary-button" onClick={()=>setPresentation("graph")}>证据关系图</button>}
     {timeline&&<button type="button" className="secondary-button" onClick={()=>setPresentation("timeline")}>事件时间线</button>}
     <button type="button" className="secondary-button" onClick={()=>setPresentation("table")}>表格</button>
     <button type="button" className="secondary-button" onClick={()=>setPresentation("json")}>原始 JSON</button>
     <button type="button" className="secondary-button" disabled={previous===null} onClick={()=>setPresentation("compare")}>对比上次读取 {previous===null?"(未记录)":""}</button>
    </div>
    {presentation==="table"&&(table?<>
     <p className="subtle">原始数据路径：{table.path} · {table.total} 条记录（最多展示 400 条）</p>
     <div className="actions">
      <label style={{flex:"1 1 220px"}}>筛选
       <input className="field" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索当前表格内容" />
      </label>
      <label style={{flex:"1 1 160px"}}>排序列
       <select className="field" value={sortColumn} onChange={e=>setSortColumn(e.target.value)}>
        <option value="">不排序</option>
        {table.columns.map(col=><option key={col} value={col}>{col}</option>)}
       </select>
      </label>
      <label style={{display:"flex",alignItems:"end",gap:6}}><input type="checkbox" checked={descending} onChange={e=>setDescending(e.target.checked)}/>降序</label>
     </div>
     <p className="subtle">显示 {filtered.length} / {Math.min(table.total,400)} 条记录。字段仅供证据阅读，不等同于风险结论。</p>
     <div style={{maxHeight:440,overflow:"auto",border:"1px solid var(--line, #cbd5e1)",borderRadius:10}}>
      <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
       <thead><tr>{table.columns.map(col=><th key={col} style={{padding:9,textAlign:"left",position:"sticky",top:0,background:"var(--surface, #fff)",borderBottom:"1px solid #aaa"}}>{col}</th>)}</tr></thead>
       <tbody>{filtered.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} style={{padding:8,borderBottom:"1px solid var(--line, #ddd)",maxWidth:240,overflowWrap:"anywhere"}}>{cell}</td>)}</tr>)}</tbody>
      </table>
     </div>
    </>:<p className="subtle">这个 API 返回的不是记录列表，请切换到「原始 JSON」阅读。</p>)}
    {presentation==="graph"&&<SentinelGraphView data={result}/>}
    {presentation==="timeline"&&<SentinelTimelineView data={result}/>}
    {presentation==="json"&&<pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:500,overflow:"auto",fontSize:12}}>{prettyJson(result)}</pre>}
    {presentation==="compare"&&<div>
     <p className="subtle">仅比较本次运行中同一个 API 的前后两次读取；不修改 Sentinel 的历史基线。</p>
     {changes.length===0?<p>没有检测到可展示的差异。</p>:
      <div style={{maxHeight:400,overflow:"auto"}}>{changes.map((c,i)=><div key={i} style={{padding:10,borderBottom:"1px solid var(--line,#ddd)"}}>
       <strong>{c.field}</strong><div>之前：{c.before||"—"}</div><div>现在：{c.after||"—"}</div>
      </div>)}</div>}
    </div>}
   </>:<p className="subtle">无可展示的结果。</p>}
  </div>}
  <p className="subtle">隐私与安全：所有数据通过 Rust 进程转发；认证令牌不会传给 React。当前页面仅允许查询固定的只读 API。需要完整扫描、审批、恢复和其他高级功能时，使用内置完整工作台。</p>
 </section>;
}
