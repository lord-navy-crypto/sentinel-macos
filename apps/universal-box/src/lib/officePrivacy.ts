/** Offline office tools: explicit CSV header mapping and TEXT-only mail merge. */
import {csvRows} from "../components/EverydayTools";
import {contactQrPayload} from "./universalBox";
export type OfficeTable={headers:string[];rows:string[][]};
const MAX_CSV_CHARS=150_000;
const MAX_ROWS=300;
const ALIASES:Record<string,string>={
  "name":"name","full name":"name","fullname":"name","姓名":"name","名字":"name",
  "phone":"phone","telephone":"phone","mobile":"phone","电话":"phone","手机":"phone",
  "email":"email","e-mail":"email","邮箱":"email","电子邮箱":"email",
  "company":"organization","organization":"organization","org":"organization","公司":"organization","组织":"organization",
  "website":"url","url":"url","site":"url","网址":"url","网站":"url",
};
export function parseOfficeCsv(source:string):OfficeTable{
 if(!source.trim()||source.length>MAX_CSV_CHARS)throw Error("Enter CSV text up to 150,000 characters.");
 const rows=csvRows(source);
 if(rows.length<2||rows.length>MAX_ROWS+1)throw Error("CSV must contain a header and 1–300 data rows.");
 const headers=rows[0].map(s=>s.trim());
 if(headers.some(h=>!h||h.length>80)||headers.length>30)
   throw Error("CSV needs 1–30 nonempty headers, each no more than 80 characters.");
 if(new Set(headers.map(h=>h.toLocaleLowerCase())).size!==headers.length)
   throw Error("Duplicate CSV headers are ambiguous.");
 const values=rows.slice(1);
 if(values.some(r=>r.length!==headers.length))throw Error("CSV row does not match the header column count.");
 if(values.some(r=>r.some(c=>c.length>5000||c.includes("\0"))))throw Error("CSV cells must be under 5,000 characters with no null bytes.");
 return {headers,rows:values};
}
export function recordsToVcf(table:OfficeTable):{text:string;count:number}{
 const map=new Map<string,number>();
 for(const [index,header] of table.headers.entries()){
   const standard=ALIASES[header.toLocaleLowerCase().trim()];
   if(!standard)continue;
   if(map.has(standard))throw Error("Multiple columns map to "+standard+". Choose one.");
   map.set(standard,index);
 }
 if(!map.has("name"))throw Error("CSV needs a Name or 姓名 column.");
 const field=(row:string[],key:string)=>row[map.get(key)??-1]??"";
 const contacts=table.rows.map((row,index)=>{
   try{
     return contactQrPayload({
       name:field(row,"name"),
       phone:field(row,"phone"),
       email:field(row,"email"),
       organization:field(row,"organization"),
       url:field(row,"url"),
     });
   }catch(e){throw Error("Contact row "+(index+2)+": "+(e instanceof Error?e.message:String(e)));}
 });
 // Fold at 75 UTF-8 octets per RFC 6350/2426, preserving escape sequences.
 const encoder=new TextEncoder();
 const fold=(line:string)=>{
   let out="",chunk="",length=0;
   for(const codePoint of line){
     const count=encoder.encode(codePoint).length;
     if(length+count>75){out+=chunk+"\r\n ";chunk=codePoint;length=1+count;}
     else{chunk+=codePoint;length+=count;}
   }
   return out+chunk;
 };
 const text=contacts.map(v=>v.split("\r\n").map(fold).join("\r\n")).join("\r\n")+"\r\n";
 return {text,count:contacts.length};
}
export type MergeDocument={filename:string;content:string};
export function mailMergeText(table:OfficeTable,template:string):MergeDocument[]{
 if(!template.trim()||template.length>10_000)throw Error("Template must contain 1–10,000 characters.");
 if(table.rows.length>100)throw Error("Mail merge is limited to 100 records at once.");
 const headerToIndex=new Map(table.headers.map((h,i)=>[h,i]));
 const tags=[...template.matchAll(/\{\{\s*([^{}]{1,120}?)\s*\}\}/gu)];
 if(!tags.length)throw Error("Insert at least one {{ColumnName}} placeholder.");
 const unknown=[...new Set(tags.map(tag=>tag[1].trim()).filter(k=>!headerToIndex.has(k)))];
 if(unknown.length)throw Error("Unknown template fields: "+unknown.slice(0,5).join(", "));
 return table.rows.map((row,index)=>{
   const content=template.replace(/\{\{\s*([^{}]{1,120}?)\s*\}\}/gu,(_,key:string)=>row[headerToIndex.get(key.trim())!]??"");
   if(content.length>30_000)throw Error("Mail merge output exceeded 30,000 characters in a letter.");
   // Generated ZIP member names never use personal data or unsafe paths.
   const filename="letter-"+String(index+1).padStart(3,"0")+".txt";
   return {filename,content};
 });
}
