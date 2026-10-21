/** Diagnose duplicate key values without silently deduplicating or executing CSV formulas. */
import JSZip from "jszip";
import {parseWorkspaceCsv} from "./csvCleanroom";
import {mergedCsvExport} from "./csvMerge";
export type DuplicateGroup={key:string[];rowNumbers:number[];conflict:boolean};
export type CsvDuplicateAudit={headers:string[];keys:number[];groups:DuplicateGroup[];blankKeys:number[];totalRows:number;duplicateRows:number;conflictingGroups:number};
export function inspectCsvKeys(raw:string,keys:readonly number[]):CsvDuplicateAudit{
 const rows=parseWorkspaceCsv(raw);
 if(!rows.length||rows.length<2)throw Error("CSV must contain headers and at least one data row.");
 const width=rows[0].length;
 if(keys.length<1||keys.length>2||new Set(keys).size!==keys.length||
    keys.some(k=>!Number.isSafeInteger(k)||k<0||k>=width))throw Error("Select one or two distinct valid key columns.");
 if(rows.some(row=>row.length!==width))throw Error("CSV rows have different column counts.");
 const maps=new Map<string,{values:string[];rows:{number:number;values:string[]}[]}>();
 const blankKeys:number[]=[];
 rows.slice(1).forEach((row,i)=>{
  if(keys.some(k=>!row[k]?.trim())){blankKeys.push(i+2);return;}
  const key=keys.map(k=>row[k]),id=JSON.stringify(key);
  const current=maps.get(id)??{values:key,rows:[]};
  current.rows.push({number:i+2,values:row});maps.set(id,current);
 });
 const groups=[...maps.values()].filter(x=>x.rows.length>1).map(x=>({
  key:x.values,rowNumbers:x.rows.map(y=>y.number),
  conflict:new Set(x.rows.map(y=>JSON.stringify(y.values))).size>1,
 }));
 return {headers:[...rows[0]],keys:[...keys],groups,blankKeys,
  totalRows:rows.length-1,duplicateRows:groups.reduce((n,g)=>n+g.rowNumbers.length,0),
  conflictingGroups:groups.filter(g=>g.conflict).length};
}
export async function exportCsvDuplicateAudit(raw:string,keys:readonly number[]):Promise<{zip:Uint8Array;audit:CsvDuplicateAudit}>{
 const audit=inspectCsvKeys(raw,keys),rows=parseWorkspaceCsv(raw);
 const selected=new Set(audit.groups.flatMap(g=>g.rowNumbers));
 const collisions=rows.slice(1).flatMap((r,i)=>selected.has(i+2)?[[String(i+2),...r]]:[]);
 const table={headers:["source_row",...audit.headers],rows:collisions};
 const zip=new JSZip();
 zip.file("duplicate-key-rows.csv","\uFEFF"+mergedCsvExport(table));
 zip.file("audit.json",JSON.stringify({generator:"Sentinel Box",type:"CSV duplicate key audit",
  selectedKeyColumns:keys.map(k=>audit.headers[k]),...audit},null,2));
 zip.file("README.txt","Duplicate-key audit only. No input rows were removed. Conflict means rows sharing a key have different values; review manually. CSV formula-like values are escaped.\n");
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
 if(bytes.length>20_000_000)throw Error("CSV audit output exceeds 20 MB.");
 return {zip:bytes,audit};
}
