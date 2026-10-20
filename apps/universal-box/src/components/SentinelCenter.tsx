import {useMemo,useState} from "react";
import {invoke} from "@tauri-apps/api/core";

type Snapshot={platform:string;os_version:string;machine_model:string;logical_cpus:number|null;physical_memory_bytes:number|null;root_volume_df_kib:string;observed_process_lines:number;source:string;mutating_actions_enabled:boolean};

type Lens={id:string;title:string;subtitle:string;items:string[]};
const LENSES:Lens[]=[
 {id:"overview",title:"系统概览",subtitle:"状态、扫描范围与证据完整性",items:["Quick Check / Easy Scan","Full Scan","Review Queue","Evidence Completeness"]},
 {id:"investigate",title:"调查工作台",subtitle:"关联证据、搜索与案例",items:["Cases and Object Story","Evidence Graph / Timeline","Deep Search","Explain This / Smart Next Step"]},
 {id:"compare",title:"历史变化",subtitle:"系统快照及行为对比",items:["Change Flow","System Checkpoints","Behavior History","Reference / Trust Profiles"]},
 {id:"system",title:"系统与存储",subtitle:"Mac 进程、启动项、网络和磁盘",items:["Machine and Processes","Login / Launch / Background Tasks","Network Intelligence","Storage Analysis / Duplicate Hashes"]},
 {id:"actions",title:"安全操作与恢复",subtitle:"预览、确认、日志与恢复",items:["Safe Change Preview","Dependency Guard","Sentinel Vault and Restore","Evidence Bundle / Audit Journal"]},
 {id:"limits",title:"权限、设置与 AI",subtitle:"可见性、隐私和本地推理",items:["Permission / Visibility","Local AI and Evidence Fallback","Watch Rules and Saved Queries","Runtime Logs / Manual"]},
];
const note="Sentinel Go 深度分析引擎尚未连接到此 React 界面；基础 Mac 状态现在可以通过 Tauri 原生命令读取。这里展示需要迁移的完整功能分类，不展示虚构的扫描数据。原 Sentinel 应用与原有安全确认流程仍然保留。";
export default function SentinelCenter(){
 const [lens,setLens]=useState("overview");
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 async function refresh(){setLoading(true);setError("");try{setSnapshot(await invoke<Snapshot>("sentinel_system_snapshot"));}catch(e){setSnapshot(null);setError(String(e));}finally{setLoading(false);}}
 const selected=useMemo(()=>LENSES.find(x=>x.id===lens)??LENSES[0],[lens]);
 return <section className="panel" aria-label="Sentinel Mac System Center">
  <p className="eyebrow">UNIVERSAL BOX / MAC SYSTEM INTELLIGENCE</p>
  <h2>Sentinel · Mac 系统中心</h2>
  <p className="subtle">以 Universal Box 的设计语言重构 Sentinel。模块按工作场景组织；原 Go 引擎及数据分析功能不在这一阶段移除。</p>
  <div className="actions"><button type="button" className="primary-button" disabled={loading} onClick={()=>void refresh()}>{loading?"读取中…":"读取 Mac 实时状态"}</button></div>
  {error&&<p role="alert" className="subtle">无法读取系统状态：{error}</p>}
  {snapshot&&<div className="panel" role="status"><h3>真实系统快照 · {snapshot.platform}</h3><p>macOS {snapshot.os_version} · {snapshot.machine_model}</p><p>逻辑 CPU：{snapshot.logical_cpus??"未知"} · 物理内存：{snapshot.physical_memory_bytes===null?"未知":(snapshot.physical_memory_bytes/1073741824).toFixed(1)+" GiB"}</p><p>可读取的进程条目：{snapshot.observed_process_lines}</p><details><summary>根卷磁盘数据（df KiB）</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{snapshot.root_volume_df_kib}</pre></details><p className="subtle">数据来源：{snapshot.source} · 不执行修改操作</p></div>}
  <p role="status" className="subtle" style={{border:"1px solid var(--line, #cbd5e1)",borderRadius:10,padding:12}}>{note}</p>
  <div className="pill-row" role="group" aria-label="Sentinel modules">
   {LENSES.map(x=><button key={x.id} type="button" className={lens===x.id?"pill active-pill":"pill"} onClick={()=>setLens(x.id)}>{x.title}</button>)}
  </div>
  <div style={{marginTop:16}}>
   <h3>{selected.title}</h3><p className="subtle">{selected.subtitle}</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
    {selected.items.map(name=><div key={name} style={{padding:14,border:"1px solid var(--line, #cbd5e1)",borderRadius:12}}>
      <strong>{name}</strong><p className="subtle" style={{marginBottom:0}}>保留于 Sentinel 引擎 · 等待集成 API</p>
     </div>)}
   </div>
  </div>
  <p className="subtle">安全边界：扫描为只读优先；任何改动继续使用 Sentinel 后端对象复核、用户确认和恢复流程。不会通过前端绕过原有检查。</p>
 </section>;
}
