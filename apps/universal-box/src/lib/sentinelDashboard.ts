/** Sentinel's own quick-check + review queue, not an independent risk model. */
type JsonRecord=Record<string,unknown>;
const obj=(v:unknown):v is JsonRecord=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function integer(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number|null{
 return typeof value==="number"&&Number.isInteger(value)&&value>=min&&value<=max?value:null;
}
const string=(value:unknown):string|null=>typeof value==="string"?value.slice(0,180):null;
export type SentinelDashboardMetric={label:string;value:string;detail?:string};
export function quickCheckMetrics(value:unknown):SentinelDashboardMetric[]{
 if(!obj(value))return [];
 const out:SentinelDashboardMetric[]=[];
 const attention=integer(value.attention_index,0,100);
 if(attention!==null)out.push({label:"Attention Index",value:String(attention),detail:"用于确定调查优先级；不是恶意软件概率"});
 const band=string(value.band);
 if(band)out.push({label:"Attention Band",value:band,detail:"Sentinel 原始分类"});
 const disk=integer(value.disk_percent,0,100);
 if(disk!==null)out.push({label:"Disk Used",value:disk+"%",detail:"来自当前系统存储占用"});
 const incidents=integer(value.incident_count);
 if(incidents!==null)out.push({label:"Recorded Incidents",value:String(incidents),detail:"记录数量不等于恶意软件数量"});
 const missing=Array.isArray(value.missing_evidence)?value.missing_evidence.length:null;
 if(missing!==null)out.push({label:"Missing Evidence",value:String(missing),detail:"缺少证据不代表不存在风险"});
 if(typeof value.behavior_baseline==="boolean")out.push({label:"Behavior Baseline",value:value.behavior_baseline?"已捕获":"未捕获"});
 if(typeof value.trust_profile==="boolean")out.push({label:"Trust Profile",value:value.trust_profile?"已建立":"未建立"});
 return out;
}
export function reviewQueueMetrics(value:unknown):SentinelDashboardMetric[]{
 if(!obj(value)||!obj(value.counts))return [];
 const counts=value.counts;
 const result:SentinelDashboardMetric[]=[];
 for(const [field,label] of [["high","High Attention"],["review","Needs Review"],["info","Informational"]] as const){
  const n=integer(counts[field]);if(n!==null)result.push({label,value:String(n),detail:"证据待审查条目，不代表安全威胁判定"});
 }
 return result;
}
