import {useMemo,useState} from "react";
import {layoutSentinelGraph,projectSentinelGraph} from "../lib/sentinelGraph";

const palette=["#67e8f9","#a78bfa","#f9a8d4","#fde68a","#86efac","#93c5fd"];
const typeColor=(kind:string,types:string[])=>palette[Math.max(0,types.indexOf(kind))%palette.length];
export default function SentinelGraphView({data}:{data:unknown}){
 const graph=useMemo(()=>projectSentinelGraph(data),[data]);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const layout=useMemo(()=>graph?layoutSentinelGraph(graph):null,[graph]);
 if(!graph||!layout)return <p>当前响应不是 Sentinel 原生 EvidenceGraph。</p>;
 const types=[...new Set(graph.nodes.map(x=>x.type))];
 const byId=new Map(layout.points.map(p=>[p.node.id,p]));
 const selected=graph.nodes.find(n=>n.id===selectedId)??null;
 const connected=selected?graph.edges.filter(e=>e.from===selected.id||e.to===selected.id):[];
 return <div style={{marginTop:14}}>
  <p className="subtle">原始 Go 图谱：{graph.originalNodeCount} 个节点、{graph.originalEdgeCount} 条关系。点击节点查看原始证据，不推断恶意软件概率。</p>
  {graph.truncated&&<p role="status" className="subtle">为了保持界面响应，最多可视化 75 个节点与 180 条关系；原始 JSON 仍完整保留，可使用「原始 JSON」查看。</p>}
  {types.length>0&&<div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:8}}>
   {types.map(t=><span key={t} style={{fontSize:12}}><span aria-hidden="true" style={{color:typeColor(t,types)}}>●</span> {t}</span>)}
  </div>}
  <div style={{width:"100%",maxHeight:510,overflow:"auto",background:"#101827",borderRadius:12,border:"1px solid #334155"}}>
   <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} role="img" aria-label="Sentinel Go evidence graph: nodes and relationships">
    {graph.edges.map((e,i)=>{
     const a=byId.get(e.from),b=byId.get(e.to);
     if(!a||!b)return null;
     const focus=selectedId!==null&&(e.from===selectedId||e.to===selectedId);
     return <line key={i} x1={a.x+65} y1={a.y+17} x2={b.x+65} y2={b.y+17}
      stroke={focus?"#facc15":"#64748b"} strokeWidth={focus?2.5:1} opacity={selectedId?(focus?0.8:0.08):0.23}/>;
    })}
    {layout.points.map(({node,x,y})=>{
     const active=node.id===selectedId;
     const related=graph.edges.some(e=>(e.from===selectedId&&e.to===node.id)||(e.to===selectedId&&e.from===node.id));
     const faded=selectedId!==null&&!active&&!related;
     return <g key={node.id} tabIndex={0} role="button" aria-label={`Evidence ${node.type}: ${node.label}`}
       onClick={()=>setSelectedId(active?null:node.id)}
       onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelectedId(active?null:node.id);}}}
       style={{cursor:"pointer",opacity:faded?0.45:1}}>
      <rect x={x} y={y} width={130} height={34} rx={8} fill="#1e293b"
       stroke={active?"#facc15":typeColor(node.type,types)} strokeWidth={active?2.8:1.2}/>
      <text x={x+8} y={y+21} fontSize={11} fontFamily="system-ui,sans-serif" fill="#f8fafc">
       {node.label.length>18?node.label.slice(0,17)+"…":node.label}
      </text>
      <title>{node.type}: {node.label}</title>
     </g>;
    })}
   </svg>
  </div>
  {selected&&<div style={{padding:14,marginTop:10,borderRadius:10,border:"1px solid var(--line, #cbd5e1)"}}>
   <h4 style={{margin:"0 0 8px"}}>{selected.label}</h4>
   <p className="subtle">证据类型：{selected.type} · 原始 Risk 指标：{selected.risk}（不是恶意软件概率）</p>
   <p style={{overflowWrap:"anywhere"}}>{selected.detail||"Sentinel 没有提供附加说明。"}</p>
   {selected.signals.length>0&&<p className="subtle">Signals: {selected.signals.join(" · ")}</p>}
   {connected.length>0&&<div><strong>关联对象（{connected.length}）</strong>
    <ul>{connected.slice(0,25).map((edge,i)=><li key={i}>{edge.relation}: {edge.from===selected.id?edge.to:edge.from}</li>)}</ul>
   </div>}
  </div>}
  <p className="subtle">节点与边均来自 Sentinel 的原始 Go EvidenceGraph API；排列方式只影响显示位置，不会改变证据、关系或分数。</p>
 </div>;
}
