import {useEffect,useMemo,useState} from "react";
import {invoke} from "@tauri-apps/api/core";

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
export default function SentinelCenter(){
 const [lens,setLens]=useState("overview");
 const [engine,setEngine]=useState<EngineStatus|null>(null);
 const [working,setWorking]=useState(false);
 const [selected,setSelected]=useState<ReadOperation|null>(null);
 const [result,setResult]=useState<unknown>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);
 const group=useMemo(()=>LENSES.find(x=>x.id===lens)??LENSES[0],[lens]);
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
   setResult(null);setSelected(null);
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
  setLoading(true);setError("");setSelected(item);setResult(null);
  try{setResult(await invoke<unknown>("sentinel_service_read",{key:item.id}));}
  catch(e){setError(String(e));}
  finally{setLoading(false);}
 }
 return <section className="panel" aria-label="Sentinel Mac System Center">
  <p className="eyebrow">UNIVERSAL BOX · ORIGINAL GO ENGINE</p>
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
   <p className="subtle">启动仅开启本机服务，不会自动运行完整扫描。完整工作台在 Universal Box 内另开窗口，原 Sentinel 操作与确认流程保持不变。</p>
  </div>
  {error&&<p role="alert" style={{whiteSpace:"pre-wrap"}}>{error}</p>}
  <div className="pill-row" role="group" aria-label="Sentinel modules">
   {LENSES.map(x=><button key={x.id} type="button" className={lens===x.id?"pill active-pill":"pill"} onClick={()=>{setLens(x.id);setSelected(null);setResult(null);setError("");}}>{x.title}</button>)}
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
   <h3>{selected.name} · Sentinel 原始 API 响应</h3>
   {loading?<p role="status">从本机 Go 引擎读取中…</p>:
    result!==null?<pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:440,overflow:"auto",fontSize:12}}>{prettyJson(result)}</pre>:
    <p className="subtle">无可展示的结果。</p>}
  </div>}
  <p className="subtle">隐私与安全：所有数据通过 Rust 进程转发；认证令牌不会传给 React。当前页面仅允许查询固定的只读 API。需要完整扫描、审批、恢复和其他高级功能时，使用内置完整工作台。</p>
 </section>;
}
