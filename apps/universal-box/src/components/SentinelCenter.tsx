import {useMemo,useState} from "react";

type Lens={id:string;title:string;subtitle:string;items:string[]};
const LENSES:Lens[]=[
 {id:"overview",title:"系统概览",subtitle:"状态、扫描范围与证据完整性",items:["Quick Check / Easy Scan","Full Scan","Review Queue","Evidence Completeness"]},
 {id:"investigate",title:"调查工作台",subtitle:"关联证据、搜索与案例",items:["Cases and Object Story","Evidence Graph / Timeline","Deep Search","Explain This / Smart Next Step"]},
 {id:"compare",title:"历史变化",subtitle:"系统快照及行为对比",items:["Change Flow","System Checkpoints","Behavior History","Reference / Trust Profiles"]},
 {id:"system",title:"系统与存储",subtitle:"Mac 进程、启动项、网络和磁盘",items:["Machine and Processes","Login / Launch / Background Tasks","Network Intelligence","Storage Analysis / Duplicate Hashes"]},
 {id:"actions",title:"安全操作与恢复",subtitle:"预览、确认、日志与恢复",items:["Safe Change Preview","Dependency Guard","Sentinel Vault and Restore","Evidence Bundle / Audit Journal"]},
 {id:"limits",title:"权限、设置与 AI",subtitle:"可见性、隐私和本地推理",items:["Permission / Visibility","Local AI and Evidence Fallback","Watch Rules and Saved Queries","Runtime Logs / Manual"]},
];
const note="Sentinel 系统引擎尚未连接到此 React 界面。这里展示需要迁移的完整功能分类，不展示虚构的扫描数据。原 Sentinel 应用与原有安全确认流程仍然保留。";
export default function SentinelCenter(){
 const [lens,setLens]=useState("overview");
 const selected=useMemo(()=>LENSES.find(x=>x.id===lens)??LENSES[0],[lens]);
 return <section className="panel" aria-label="Sentinel Mac System Center">
  <p className="eyebrow">UNIVERSAL BOX / MAC SYSTEM INTELLIGENCE</p>
  <h2>Sentinel · Mac 系统中心</h2>
  <p className="subtle">以 Universal Box 的设计语言重构 Sentinel。模块按工作场景组织；原 Go 引擎及数据分析功能不在这一阶段移除。</p>
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
