/** Audit CSV column completeness and inferred value classes, without modifying cell text. */
import {parseWorkspaceCsv} from "./csvCleanroom";
import {mergedCsvExport} from "./csvMerge";
export type CsvColumnProfile={name:string;index:number;rows:number;missing:number;distinct:number;type:"empty"|"number"|"date"|"boolean"|"text"|"mixed";min:number|null;max:number|null;mean:number|null;sample:string[]};
export type CsvProfile={rows:number;columns:CsvColumnProfile[];irregularRows:number};
function typeOfCell(cell:string):"number"|"date"|"boolean"|"text"{
 const s=cell.trim();
 if(/^(?:true|false)$/iu.test(s))return "boolean";
 if(/^\d{4}-\d{2}-\d{2}$/u.test(s)){
  const d=new Date(s+"T00:00:00Z");
  if(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s)return "date";
 }
 if(/^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(s)&&
   !/^[+-]?0\d+/u.test(s)&&Number.isFinite(Number(s)))return "number";
 return "text";
}
export function profileCsv(source:string):CsvProfile{
 if(!source.trim()||source.length>450_000)throw Error("CSV must contain 1–450,000 characters.");
 const records=parseWorkspaceCsv(source);
 if(records.length<2||records.length>7001)throw Error("CSV needs a header and 1–7,000 data records.");
 const headers=records[0].map(x=>x.trim());
 if(!headers.length||headers.length>60||headers.some(x=>!x||x.length>150)||new Set(headers).size!==headers.length)
  throw Error("CSV needs 1–60 nonblank unique column headings.");
 const width=headers.length,rows=records.slice(1),irregularRows=rows.filter(r=>r.length!==width).length;
 if(irregularRows)throw Error("CSV contains "+irregularRows+" rows of inconsistent width. Repair structure before profiling.");
 const columns:CsvColumnProfile[]=headers.map((name,index)=>{
  const cells=rows.map(r=>r[index]??"");
  const present=cells.map(x=>x.trim()).filter(Boolean);
  const missing=rows.length-present.length;
  const kinds=new Set(present.map(typeOfCell));
  const type=present.length===0?"empty":kinds.size>1?"mixed":[...kinds][0];
  const numeric=type==="number"?present.map(Number):[];
  const min=numeric.length?Math.min(...numeric):null,max=numeric.length?Math.max(...numeric):null;
  const mean=numeric.length?numeric.reduce((a,b)=>a+b,0)/numeric.length:null;
  return {name,index,rows:rows.length,missing,distinct:new Set(present).size,type,
   min:Number.isFinite(min)?min:null,max:Number.isFinite(max)?max:null,mean:Number.isFinite(mean)?mean:null,
   sample:[...new Set(present)].slice(0,3).map(x=>x.slice(0,90))};
 });
 return {rows:rows.length,columns,irregularRows:0};
}
export function profileCsvReportCsv(result:CsvProfile):string{
 return "\uFEFF"+mergedCsvExport({headers:["column","inferred_type","rows","missing","distinct_nonblank","min","max","mean","sample_values"],
  rows:result.columns.map(c=>[c.name,c.type,String(c.rows),String(c.missing),String(c.distinct),
   c.min===null?"":String(c.min),c.max===null?"":String(c.max),c.mean===null?"":String(c.mean),c.sample.join(" | ")])});
}
