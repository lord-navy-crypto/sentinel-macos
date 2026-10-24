/** Preserve native Go TimelineEvent semantics in a bounded client-side view. */
export type SentinelTimelineEvent={id:string;at:number;kind:string;severity:string;title:string;detail:string;object_id:string};
export type TimelineProjection={events:SentinelTimelineEvent[];total:number;sessionOnly:boolean;note:string};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const str=(v:unknown)=>typeof v==="string"?v.slice(0,500):"";
export function projectSentinelTimeline(data:unknown):TimelineProjection|null{
 if(!record(data)||!Array.isArray(data.events))return null;
 const events:SentinelTimelineEvent[]=data.events.slice(0,400).filter(record).map((o,i)=>({
  id:str(o.id)||"event-"+i,
  at:typeof o.at==="number"&&Number.isFinite(o.at)?o.at:0,
  kind:str(o.kind)||"unknown",
  severity:str(o.severity)||"unknown",
  title:str(o.title)||"Untitled event",
  detail:str(o.detail),
  object_id:str(o.object_id),
 })).sort((a,b)=>b.at-a.at);
 return {events:events.slice(0,200),total:data.events.length,sessionOnly:data.session_only===true,note:str(data.note)};
}
export function filterSentinelTimeline(events:SentinelTimelineEvent[],query:string,kind:string){
 const q=query.trim().toLocaleLowerCase();
 return events.filter(e=>(!kind||e.kind===kind)&&(!q||[e.title,e.detail,e.object_id,e.kind].some(v=>v.toLocaleLowerCase().includes(q))));
}
