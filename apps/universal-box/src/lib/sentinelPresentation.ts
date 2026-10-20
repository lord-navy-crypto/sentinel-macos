/** Pure, bounded projections of the original Sentinel Go API JSON. No evidence is changed. */
export type SentinelTable={path:string;columns:string[];rows:string[][];total:number};
export type SentinelChange={field:string;before:string;after:string};
const MAX_VISIT=200;
const MAX_ROWS=400;
const MAX_COLUMNS=12;
const MAX_VALUE=240;
function isObject(value:unknown):value is Record<string,unknown>{
 return value!==null&&typeof value==="object"&&!Array.isArray(value);
}
function display(value:unknown):string{
 if(value===null||value===undefined)return "";
 if(typeof value==="string")return value.slice(0,MAX_VALUE);
 if(typeof value==="boolean"||typeof value==="number")return String(value);
 if(Array.isArray(value))return "["+value.length+" items]";
 return "{object}";
}
/** Find the most useful table of record-like objects. Does not introspect arbitrary prototypes. */
export function sentinelTable(value:unknown):SentinelTable|null{
 const q:{item:unknown;path:string}[]=[{item:value,path:"result"}];
 let visits=0, best:SentinelTable|null=null;
 while(q.length&&visits++<MAX_VISIT){
  const {item,path}=q.shift()!;
  if(Array.isArray(item)){
   const entries=item.filter(isObject);
   if(entries.length){
    const columns=[...new Set(entries.slice(0,Math.min(30,entries.length))
      .flatMap(row=>Object.keys(row).filter(k=>k.length<=60)))].slice(0,MAX_COLUMNS);
    if(columns.length){
     const rows=entries.slice(0,MAX_ROWS).map(row=>columns.map(k=>display(row[k])));
     const candidate={path,columns,rows,total:entries.length};
     if(!best||candidate.total>best.total)best=candidate;
    }
   }
   if(item.length>0&&item.length<15&&best===null){
    item.forEach((row,i)=>{if(isObject(row))q.push({item:row,path:path+"["+i+"]"});});
   }
  }else if(isObject(item)){
   for(const [key,sub] of Object.entries(item).slice(0,40)){
    if(sub!==null&&typeof sub==="object")q.push({item:sub,path:path+"."+key});
   }
  }
 }
 return best;
}
function csvCell(value:string):string{
 const safe=/^[\s\uFEFF]*[=+\-@\t\r]/.test(value)?"'"+value:value;
 return '"'+safe.replaceAll('"','""')+'"';
}
export function sentinelCsv(table:SentinelTable,rows=table.rows):string{
 return "\uFEFF"+[table.columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
}
export function filteredSentinelRows(table:SentinelTable,search:string,sortKey="",desc=false):string[][]{
 const query=search.trim().toLocaleLowerCase();
 const rows=table.rows.filter(row=>!query||row.some(value=>value.toLocaleLowerCase().includes(query)));
 const idx=table.columns.indexOf(sortKey);
 return idx<0?rows:rows.slice().sort((a,b)=>{
  const av=a[idx]??"",bv=b[idx]??"";
  const na=Number(av),nb=Number(bv);
  const comparison=av.trim()!==""&&bv.trim()!==""&&Number.isFinite(na)&&Number.isFinite(nb)?
   na-nb:av.localeCompare(bv,undefined,{numeric:true,sensitivity:"base"});
  return desc?-comparison:comparison;
 });
}
/** Compare two readings of the same API, capped to 60 leaf changes. */
export function sentinelDiff(previous:unknown,next:unknown):SentinelChange[]{
 const changes:SentinelChange[]=[];
 const queue:{a:unknown;b:unknown;path:string;depth:number}[]=[{a:previous,b:next,path:"result",depth:0}];
 let visited=0;
 while(queue.length&&visited++<MAX_VISIT&&changes.length<60){
  const {a,b,path,depth}=queue.shift()!;
  if(isObject(a)&&isObject(b)&&depth<3){
   const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].slice(0,40);
   for(const key of keys)queue.push({a:a[key],b:b[key],path:path+"."+key,depth:depth+1});
  }else if(Array.isArray(a)&&Array.isArray(b)){
   if(JSON.stringify(a.slice(0,MAX_ROWS))!==JSON.stringify(b.slice(0,MAX_ROWS))){
    changes.push({field:path,before:a.length+" items",after:b.length+" items"});
   }
  }else if(a!==b){
   if(JSON.stringify(a)!==JSON.stringify(b))changes.push({field:path,before:display(a),after:display(b)});
  }
 }
 return changes;
}
export function sentinelSummary(value:unknown):{name:string;value:string}[]{
 if(!isObject(value))return [];
 return Object.entries(value).filter(([k,v])=>k.length<48&&(typeof v==="string"||typeof v==="number"||typeof v==="boolean"||Array.isArray(v)))
  .slice(0,12).map(([name,item])=>({name:name.replaceAll("_"," "),value:display(item)}));
}
