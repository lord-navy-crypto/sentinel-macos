import {useMemo,useState} from "react";
import {projectSentinelTimeline,filterSentinelTimeline} from "../lib/sentinelTimeline";
function renderTime(seconds:number):string{
 const date=new Date(seconds*1000);
 return Number.isFinite(date.getTime())?date.toLocaleString():"Unknown time";
}
export default function SentinelTimelineView({data}:{data:unknown}){
 const timeline=useMemo(()=>projectSentinelTimeline(data),[data]);
 const [query,setQuery]=useState("");
 const [kind,setKind]=useState("");
 const kinds=useMemo(()=>[...new Set(timeline?.events.map(e=>e.kind)??[])].sort(),[timeline]);
 const items=useMemo(()=>timeline?filterSentinelTimeline(timeline.events,query,kind):[],[timeline,query,kind]);
 if(!timeline)return <p>当前响应不是 Sentinel 的原生 Timeline 数据。</p>;
 return <div style={{marginTop:14}}>
  <p className="subtle">Sentinel 时间线：{timeline.total} 项原始事件，最多展示 200 项。</p>
  {timeline.sessionOnly&&<p role="status" className="subtle">这条时间线来自 Sentinel 当前会话，不代表全时间段连续监控。</p>}
  {timeline.note&&<details><summary>Go 引擎对数据范围的说明</summary><p className="subtle">{timeline.note}</p></details>}
  <div className="actions">
   <label style={{flex:"1 1 230px"}}>搜索证据事件
    <input className="field" value={query} onChange={e=>setQuery(e.target.value)} placeholder="标题、对象或事件说明…"/>
   </label>
   <label style={{flex:"1 1 140px"}}>事件类型
    <select className="field" value={kind} onChange={e=>setKind(e.target.value)}>
     <option value="">所有类型</option>
     {kinds.map(k=><option key={k} value={k}>{k}</option>)}
    </select>
   </label>
  </div>
  <p className="subtle">显示 {items.length} 条记录。Severity 是 Sentinel 的原始标记，不是恶意软件概率。</p>
  <div style={{maxHeight:480,overflow:"auto",paddingLeft:16,borderLeft:"2px solid var(--line,#94a3b8)"}}>
   {items.length===0?<p className="subtle">没有符合筛选条件的记录。</p>:items.map((event,i)=>
    <article key={event.id+"-"+i} style={{position:"relative",padding:"12px 14px",margin:"8px 0 14px",border:"1px solid var(--line,#cbd5e1)",borderRadius:12}}>
     <span aria-hidden="true" style={{position:"absolute",left:-23,top:22,width:12,height:12,borderRadius:6,background:"var(--accent,#64748b)"}}/>
     <div className="subtle" style={{fontSize:12}}>{renderTime(event.at)} · {event.kind} · {event.severity}</div>
     <strong style={{overflowWrap:"anywhere"}}>{event.title}</strong>
     {event.detail&&<p style={{margin:"6px 0 0",overflowWrap:"anywhere"}}>{event.detail}</p>}
     {event.object_id&&<p className="subtle" style={{fontSize:12,overflowWrap:"anywhere"}}>关联对象：{event.object_id}</p>}
    </article>)}
  </div>
 </div>;
}
