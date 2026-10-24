/** Projection of the original Sentinel EvidenceGraph JSON. No score is recalculated. */
export type EvidenceNode={id:string;ref:string;type:string;label:string;detail:string;risk:number;signals:string[]};
export type EvidenceEdge={from:string;to:string;relation:string;detail:string};
export type DisplayGraph={nodes:EvidenceNode[];edges:EvidenceEdge[];originalNodeCount:number;originalEdgeCount:number;truncated:boolean};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const s=(v:unknown)=>typeof v==="string"?v.slice(0,320):"";
export function projectSentinelGraph(value:unknown):DisplayGraph|null{
 if(!record(value)||!Array.isArray(value.nodes)||!Array.isArray(value.edges))return null;
 const originalNodeCount=value.nodes.length,originalEdgeCount=value.edges.length;
 const seen=new Set<string>();
 const nodes:EvidenceNode[]=[];
 for(const raw of value.nodes.slice(0,150)){
  if(!record(raw)||typeof raw.id!=="string"||!raw.id||seen.has(raw.id))continue;
  if(nodes.length>=75)break;
  seen.add(raw.id);
  nodes.push({id:raw.id,ref:s(raw.ref),type:s(raw.type)||"other",label:s(raw.label)||raw.id.slice(0,80),
   detail:s(raw.detail),risk:typeof raw.risk==="number"&&Number.isFinite(raw.risk)?raw.risk:0,
   signals:Array.isArray(raw.signals)?raw.signals.filter((v):v is string=>typeof v==="string").slice(0,10):[]});
 }
 const edges:EvidenceEdge[]=[];
 for(const raw of value.edges.slice(0,500)){
  if(edges.length>=180)break;
  if(!record(raw)||typeof raw.from!=="string"||typeof raw.to!=="string")continue;
  if(!seen.has(raw.from)||!seen.has(raw.to))continue;
  edges.push({from:raw.from,to:raw.to,relation:s(raw.relation),detail:s(raw.detail)});
 }
 return {nodes,edges,originalNodeCount,originalEdgeCount,truncated:nodes.length<originalNodeCount||edges.length<originalEdgeCount};
}
export type GraphPoint={x:number;y:number;node:EvidenceNode};
export function layoutSentinelGraph(graph:DisplayGraph):{points:GraphPoint[];width:number;height:number}{
 const types=[...new Set(graph.nodes.map(n=>n.type))].slice(0,6);
 const columns=types.length||1,limitColumns=6;
 const buckets=new Map(types.map(t=>[t,[] as EvidenceNode[]]));
 graph.nodes.forEach((n,i)=>{const k=types.includes(n.type)?n.type:types[i%types.length]??"other";buckets.get(k)?.push(n);});
 const biggest=Math.max(1,...[...buckets.values()].map(v=>v.length));
 const width=Math.max(500,columns*174+30),height=Math.max(360,biggest*56+68);
 const points:GraphPoint[]=[];
 [...buckets.values()].forEach((bucket,c)=>bucket.forEach((node,i)=>points.push({x:22+c*174,y:56+i*56,node})));
 return {points,width:Math.min(width,limitColumns*174+30),height};
}
