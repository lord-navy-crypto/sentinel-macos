/** Consent-driven Office, data, and text batch operations. No remote calls or source mutation. */
import JSZip from "jszip";
import {markdownToDocx} from "./documentExport";
import {parseWorkspaceCsv} from "./csvCleanroom";
import {mergedCsvExport} from "./csvMerge";
import {replaceTextLiteral} from "./quickBatchText";

export type SourceText={name:string;text:string};
export type JoinMode="inner"|"left"|"full";
export type JoinResult={
 csv:string;headers:string[];rows:string[][];matches:number;
 unmatchedLeft:number;unmatchedRight:number;
};
const safeName=(raw:string)=>raw.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu,"_")
 .replace(/^\.+/u,"_").replace(/\.[^.]+$/u,"").slice(0,75)||"file";
const countBytes=(text:string)=>new TextEncoder().encode(text).length;
function requireBounds(text:string,limit:number,name:string){
 if(!text.trim()||text.length>limit)throw Error(name+" must contain 1–"+limit+" characters.");
}
function readDataCsv(text:string,name:string,maxRows:number,maxCols:number):{header:string[];rows:string[][]}{
 requireBounds(text,350_000,name);
 const data=parseWorkspaceCsv(text);
 if(data.length<2||data.length>maxRows+1)throw Error(name+" requires 1–"+maxRows+" data rows.");
 const header=data[0].map(x=>x.trim()),set=new Set<string>();
 if(header.length>maxCols)throw Error(name+" has too many columns.");
 for(const name of header){
  if(!name||name.includes("{{")||name.includes("}}")||set.has(name))throw Error("CSV column headers must be unique, nonempty and not contain template braces.");
  set.add(name);
 }
 if(data.slice(1).some(row=>row.length!==header.length))throw Error(name+" has rows with inconsistent column counts.");
 return {header,rows:data.slice(1)};
}
const placeholders=(template:string)=>{
 const result=[...template.matchAll(/\{\{\s*([^{}\n]+?)\s*\}\}/gu)].map(x=>x[1].trim());
 return [...new Set(result)];
};
export function planWordMailMerge(csvText:string,template:string):{headers:string[];rowCount:number;fields:string[]}{
 requireBounds(template,12000,"Word template");
 const parsed=readDataCsv(csvText,"Mail merge CSV",20,40);
 const fields=placeholders(template);
 if(!fields.length)throw Error("Insert at least one {{column_name}} placeholder.");
 for(const field of fields)if(!parsed.header.includes(field))throw Error("Template field missing from CSV headers: "+field);
 if(template.includes("{{")&&/\{\{[^{}]*\}\}/gu.test(template)===false)throw Error("Template braces are malformed.");
 return {headers:parsed.header,rowCount:parsed.rows.length,fields};
}
function wordText(template:string,headers:string[],row:string[]):string{
 const cells=new Map(headers.map((h,i)=>[h,row[i]]));
 const result=template.replace(/\{\{\s*([^{}\n]+?)\s*\}\}/gu,(_,name:string)=>cells.get(name.trim())??"");
 if(result.includes("{{")||result.includes("}}"))throw Error("Unrecognized template placeholder or unmatched braces.");
 return result;
}
export async function makeWordMailMerge(csvText:string,template:string):Promise<Uint8Array>{
 planWordMailMerge(csvText,template);
 const {header,rows}=readDataCsv(csvText,"Mail merge CSV",20,40);
 const zip=new JSZip(),entries:{row:number;filename:string}[]=[];
 for(let i=0;i<rows.length;i++){
  const markdown=wordText(template,header,rows[i]);
  const file="documents/"+String(i+1).padStart(3,"0")+"-letter.docx";
  zip.file(file,await markdownToDocx(markdown));
  entries.push({row:i+1,filename:file});
 }
 zip.file("reports/manifest.json",JSON.stringify({
  generator:"Sentinel Box",operation:"CSV to editable Word mail merge",rows:rows.length,
  fields:placeholders(template),files:entries,sourceDataIncluded:false
 },null,2));
 zip.file("reports/README.txt","Sentinel Box mail merge: generated editable DOCX files, not emailed or sent. Source CSV is not included.\n");
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(bytes.length>20_000_000)throw Error("Word mail merge archive exceeds 20 MB.");
 return bytes;
}
export function joinTwoCsv(a:string,b:string,key:string,mode:JoinMode):JoinResult{
 if(!["inner","left","full"].includes(mode))throw Error("Choose inner, left or full join.");
 if(!key.trim()||key.length>100)throw Error("Choose a valid join key.");
 const left=readDataCsv(a,"Left CSV",2000,60),right=readDataCsv(b,"Right CSV",2000,60);
 const lkey=left.header.indexOf(key),rkey=right.header.indexOf(key);
 if(lkey<0||rkey<0)throw Error("Join key must exist in both CSV header rows.");
 const createIndex=(rows:string[][],ix:number,label:string)=>{
  const map=new Map<string,string[]>();
  for(const row of rows){
   const value=row[ix];
   if(!value.trim())throw Error(label+" contains a blank join key.");
   if(map.has(value))throw Error(label+" contains a duplicate key: "+value.slice(0,80));
   map.set(value,row);
  }
  return map;
 };
 const lindex=createIndex(left.rows,lkey,"Left CSV"),rindex=createIndex(right.rows,rkey,"Right CSV");
 const headers=[key,...left.header.filter((_,i)=>i!==lkey).map(h=>"left."+h),
  ...right.header.filter((_,i)=>i!==rkey).map(h=>"right."+h)];
 const project=(id:string,l?:string[],r?:string[])=>[
  id,...left.header.filter((_,i)=>i!==lkey).map(h=>l?.[left.header.indexOf(h)]??""),
  ...right.header.filter((_,i)=>i!==rkey).map(h=>r?.[right.header.indexOf(h)]??"")
 ];
 let matches=0,unmatchedLeft=0,unmatchedRight=0;
 const output:string[][]=[];
 for(const [id,row] of lindex){
  const rightRow=rindex.get(id);
  if(rightRow){matches++;output.push(project(id,row,rightRow));}
  else{unmatchedLeft++;if(mode!=="inner")output.push(project(id,row));}
 }
 for(const [id,row] of rindex)if(!lindex.has(id)){
  unmatchedRight++;
  if(mode==="full")output.push(project(id,undefined,row));
 }
 if(output.length>4000)throw Error("Join exceeds 4,000 output rows.");
 return {headers,rows:output,csv:mergedCsvExport({headers,rows:output}),
  matches,unmatchedLeft,unmatchedRight};
}
export async function exportCsvJoin(a:string,b:string,key:string,mode:JoinMode):Promise<Uint8Array>{
 const res=joinTwoCsv(a,b,key,mode),zip=new JSZip();
 zip.file("joined/joined.csv",res.csv);
 zip.file("reports/manifest.json",JSON.stringify({
  generator:"Sentinel Box",operation:"CSV key join",mode,key,outputRows:res.rows.length,
  matches:res.matches,unmatchedLeft:res.unmatchedLeft,unmatchedRight:res.unmatchedRight,
  columns:res.headers,sourceDataIncluded:false
 },null,2));
 return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
export type BatchReplacementReport={filename:string;output:string|null;matches:number;status:"changed"|"unchanged"|"failed";error?:string};
export type BatchTextResult={bytes:Uint8Array;report:BatchReplacementReport[]};
export function planBatchText(files:readonly SourceText[],search:string,replacement:string){
 if(files.length<1||files.length>20)throw Error("Select 1–20 text files.");
 if(search.length<1||search.length>1000||replacement.length>10000)throw Error("Search/replacement length exceeds limit.");
 let total=0;
 for(const file of files){
  if(!/\.(txt|md|csv|tsv|json|srt|vtt)$/iu.test(file.name))throw Error("Only explicit UTF-8 text file formats are supported.");
  if(!file.text.length||file.text.length>200_000)throw Error("Each text file must be 1–200,000 characters.");
  total+=countBytes(file.text);if(total>2_000_000)throw Error("Batch exceeds the 2 MB input budget.");
 }
 return files.length;
}
export async function exportBatchText(files:readonly SourceText[],search:string,replacement:string):Promise<BatchTextResult>{
 planBatchText(files,search,replacement);
 const zip=new JSZip(),report:BatchReplacementReport[]=[];
 for(const [i,file] of files.entries()){
  const item:BatchReplacementReport={filename:file.name,output:null,matches:0,status:"unchanged"};
  try{
   const result=replaceTextLiteral(file.text,search,replacement);
   item.matches=result.count;
   if(result.count>0){
    const path="replaced/"+String(i+1).padStart(3,"0")+"-"+safeName(file.name)+"."+file.name.split(".").pop()!.toLowerCase();
    zip.file(path,result.text);item.output=path;item.status="changed";
   }
  }catch(e){item.status="failed";item.error=e instanceof Error?e.message:String(e);}
  report.push(item);
 }
 zip.file("reports/manifest.json",JSON.stringify({generator:"Sentinel Box",operation:"Literal batch find/replace",
  inputFiles:files.length,changed:report.filter(r=>r.status==="changed").length,
  unchanged:report.filter(r=>r.status==="unchanged").length,failed:report.filter(r=>r.status==="failed").length,
  results:report,sourceDataIncluded:false},null,2));
 zip.file("reports/README.txt","Sentinel Box literal replacement. Only changed files are exported as copies; originals unchanged. No regex. Review before using.\n");
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
 if(bytes.length>20_000_000)throw Error("Text replacement archive exceeds 20 MB.");
 return {bytes,report};
}
