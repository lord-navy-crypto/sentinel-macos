/** Line-oriented JSON audit: explicit input, bounded records, no partial success disguised as conversion. */
import {mergedCsvExport} from "./csvMerge";
export type NdjsonIssue={line:number;reason:string};
export type NdjsonAudit={totalLines:number;validRecords:number;invalidRecords:number;fields:string[];missing:{field:string;count:number}[];issues:NdjsonIssue[];records:Record<string,unknown>[]};
function valueClass(v:unknown):string{return v===null?"null":Array.isArray(v)?"array":typeof v;}
function ownRecord(v:unknown):v is Record<string,unknown>{return v!==null&&!Array.isArray(v)&&typeof v==="object";}
export function inspectNdjson(source:string):NdjsonAudit{
 if(!source.trim()||source.length>500_000)throw Error("Choose NDJSON with 1–500,000 characters.");
 const rows=source.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n").split("\n");
 if(rows.length>5001)throw Error("NDJSON exceeds 5,000 physical lines.");
 const records:Record<string,unknown>[]=[],issues:NdjsonIssue[]=[];const allFields=new Set<string>();
 let totalLines=0;
 for(let i=0;i<rows.length;i++){
  const line=rows[i].trim();if(!line)continue;
  totalLines++;
  if(line.length>50_000){issues.push({line:i+1,reason:"Line exceeds 50,000 characters"});continue;}
  try{
   const value:unknown=JSON.parse(line);
   if(!ownRecord(value))throw Error("Expected a JSON object, not an array or scalar");
   const keys=Object.keys(value);
   if(keys.length>60||keys.some(k=>!k||k.length>150||k==="__proto__"||k==="constructor"||k==="prototype"))
    throw Error("Record has too many, invalid, or reserved keys");
   keys.forEach(k=>allFields.add(k));records.push(value);
  }catch(e){issues.push({line:i+1,reason:e instanceof SyntaxError?"Invalid JSON syntax":e instanceof Error?e.message:String(e)});}
 }
 if(!totalLines)throw Error("No nonblank NDJSON records.");
 if(allFields.size>80)throw Error("Combined data exceeds 80 distinct keys.");
 const fields=[...allFields].sort((a,b)=>a.localeCompare(b));
 const missing=fields.map(field=>({field,count:records.filter(r=>!Object.prototype.hasOwnProperty.call(r,field)).length}));
 return {totalLines,validRecords:records.length,invalidRecords:issues.length,fields,missing,issues,records};
}
export function ndjsonToJson(report:NdjsonAudit):string{
 if(report.invalidRecords||!report.records.length)throw Error("Fix all NDJSON errors before conversion; no silent partial export.");
 const json=JSON.stringify(report.records,null,2);
 if(json.length>2_000_000)throw Error("Expanded JSON output exceeds 2 MB.");
 return json+"\n";
}
export function ndjsonToCsv(report:NdjsonAudit):string{
 if(report.invalidRecords||!report.records.length)throw Error("Fix all NDJSON errors before conversion; no silent partial export.");
 if(!report.fields.length)throw Error("No object fields are available.");
 const stringCell=(v:unknown):string=>v===undefined||v===null?"":typeof v==="string"?v:typeof v==="object"?JSON.stringify(v):String(v);
 const csv="\uFEFF"+mergedCsvExport({headers:report.fields,rows:report.records.map(r=>report.fields.map(f=>stringCell(r[f])))});
 if(csv.length>2_000_000)throw Error("Converted CSV exceeds 2 MB.");
 return csv;
}
