/** Structured newline-delimited JSON logs: in-memory, local, with invalid rows retained. */
export const JSONL_MAX_BYTES=2_000_000;
export const JSONL_MAX_LINES=5_000;
export type LogLevel="fatal"|"error"|"warn"|"info"|"debug"|"trace"|"other"|"invalid";
export type JsonlRecord={
 line:number;level:LogLevel;timestamp:string;message:string;raw:string;valid:boolean;
};
export type JsonlReport={records:JsonlRecord[];invalidCount:number;bytes:number};
const LEVELS=["fatal","error","warn","info","debug","trace"] as const;
const levelFrom=(value:unknown):LogLevel=>{
 if(typeof value!=="string")return "other";
 const text=value.trim().toLowerCase();
 if(text==="warning")return "warn";
 if(text==="critical"||text==="emergency")return "fatal";
 if((LEVELS as readonly string[]).includes(text))return text as LogLevel;
 return "other";
};
const display=(value:unknown):string=>{
 if(typeof value==="string")return value;
 if(value===undefined||value===null)return "";
 return JSON.stringify(value);
};
export function parseLocalJsonl(content:string,bytes:number):JsonlReport{
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>JSONL_MAX_BYTES||
    !content||content.length>JSONL_MAX_BYTES)
  throw Error("JSONL file must be 1–2,000,000 bytes of UTF-8 text.");
 const rows=content.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n").split("\n");
 if(rows.at(-1)==="")rows.pop();
 if(!rows.length||rows.length>JSONL_MAX_LINES)
  throw Error("JSONL must contain 1–5,000 lines.");
 const records:JsonlRecord[]=[];
 let invalidCount=0;
 for(let i=0;i<rows.length;i++){
  const raw=rows[i],line=i+1;
  if(raw.length>50_000)throw Error("JSONL line "+line+" exceeds 50,000 characters.");
  try{
   const value:unknown=JSON.parse(raw);
   if(!value||typeof value!=="object"||Array.isArray(value))
    throw Error("Not a JSON object.");
   const object=value as Record<string,unknown>;
   const level=levelFrom(object.level??object.severity??object.logLevel??object.status);
   const timestamp=display(object.timestamp??object.time??object.ts??"").slice(0,150);
   const message=display(object.message??object.msg??object.event??object.description??"").slice(0,10_000);
   records.push({line,level,timestamp,message,raw,valid:true});
  }catch{
   invalidCount++;
   records.push({line,level:"invalid",timestamp:"",message:"无效 JSON 对象或空行",raw,valid:false});
  }
 }
 return {records,invalidCount,bytes};
}
export function jsonlLevelCounts(report:JsonlReport):{level:LogLevel;count:number}[]{
 const map=new Map<LogLevel,number>();
 for(const item of report.records)map.set(item.level,(map.get(item.level)||0)+1);
 return [...map].map(([level,count])=>({level,count})).sort((a,b)=>b.count-a.count||a.level.localeCompare(b.level));
}
export function filterJsonl(records:readonly JsonlRecord[],level:LogLevel|"all",term:string):JsonlRecord[]{
 const needle=term.trim().toLocaleLowerCase();
 return records.filter(item=>(level==="all"||item.level===level)&&
  (!needle||(item.raw+" "+item.message).toLocaleLowerCase().includes(needle)));
}
function csvCell(value:string):string{
 const escaped=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+escaped.replace(/"/gu,'""')+'"';
}
export function exportJsonlCsv(records:readonly JsonlRecord[]):string{
 if(!records.length||records.length>JSONL_MAX_LINES)
  throw Error("Choose 1–5,000 structured-log lines to export.");
 const rows=records.map(item=>[
  String(item.line),csvCell(item.level),item.valid?"true":"false",
  csvCell(item.timestamp),csvCell(item.message),csvCell(item.raw),
 ].join(","));
 return "\uFEFFline,level,valid,timestamp,message,raw_jsonl\r\n"+rows.join("\r\n")+"\r\n";
}
