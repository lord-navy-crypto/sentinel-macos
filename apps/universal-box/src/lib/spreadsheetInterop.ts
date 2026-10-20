/** Bounded XLSX single-worksheet interoperability. No macro, formula or styles execution. */
import JSZip from "jszip";
import {csvRows} from "../components/EverydayTools";
import {makeDataTable,type DataTable} from "./tableTools";
import {inspectZip} from "./zipInspector";

const MAX_ROWS=1000,MAX_COLS=50,MAX_INPUT=4_000_000;
const utf8=new TextDecoder("utf-8",{fatal:true});
const xmlEscape=(s:string)=>s.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;")
  .replace(/"/gu,"&quot;").replace(/'/gu,"&apos;");
function checked(s:string):string{
 if(s.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(s))
   throw Error("Invalid XML control characters or cell exceeding 4,000 characters.");
 return s;
}
function colName(n:number):string{
 let s="";for(let x=n+1;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;
 return s;
}
function validate(table:DataTable):void{
 if(table.headers.length<1||table.headers.length>MAX_COLS||table.rows.length>MAX_ROWS)
   throw Error("Spreadsheet limit: 1,000 data rows and 50 columns.");
 let total=0;
 for(const row of [table.headers,...table.rows]){
   if(row.length!==table.headers.length)throw Error("Column counts differ.");
   for(const cell of row){total+=checked(cell).length;}
 }
 if(total>600_000)throw Error("Spreadsheet text exceeds 600,000 characters.");
}
export function csvToXlsxTable(source:string,delimiter:","|"\t"=","):DataTable{
 if(source.length>500_000)throw Error("CSV exceeds 500,000 characters.");
 const table=makeDataTable(csvRows(source,delimiter),true);validate(table);return table;
}
export async function tableToXlsx(table:DataTable):Promise<Uint8Array>{
 validate(table);
 const zip=new JSZip();
 zip.file("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?>'
   +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
   +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
   +'<Default Extension="xml" ContentType="application/xml"/>'
   +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
   +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
   +'</Types>');
 zip.file("_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?>'
   +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
   +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 zip.file("xl/workbook.xml",'<?xml version="1.0" encoding="UTF-8"?>'
   +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
   +'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
   +'<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>');
 zip.file("xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8"?>'
   +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
   +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
 const rows=[table.headers,...table.rows];
 let sheet='<?xml version="1.0" encoding="UTF-8"?>'
   +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
 rows.forEach((cells,i)=>{
   sheet+='<row r="'+(i+1)+'">';
   cells.forEach((value,j)=>{
     // All user CSV values are text so =SUM() / leading zeros are not interpreted.
     sheet+='<c r="'+colName(j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(value)+'</t></is></c>';
   });
   sheet+='</row>';
 });
 zip.file("xl/worksheets/sheet1.xml",sheet+'</sheetData></worksheet>');
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(bytes.length>MAX_INPUT)throw Error("Generated XLSX exceeds 4 MB.");
 return bytes;
}
function xmlDecode(text:string):string{
 // Validate the encoded input before decoding: &amp; legitimately becomes bare &.
 const validEntity=/&(?:#(?:[xX][0-9a-fA-F]+|[0-9]+)|amp|lt|gt|quot|apos);/gu;
 if(text.replace(validEntity,"").includes("&"))throw Error("Unsupported spreadsheet XML entity.");
 return text.replace(/&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|amp|lt|gt|quot|apos);/gu,(_,token:string)=>{
   const known:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
   if(Object.prototype.hasOwnProperty.call(known,token))return known[token];
   const hex=/^#x/iu.test(token),n=parseInt(token.slice(hex?2:1),hex?16:10);
   if(!Number.isInteger(n)||n<1||n>0x10ffff||(n>=0xd800&&n<=0xdfff))
     throw Error("Invalid XML numeric character.");
   return String.fromCodePoint(n);
 });
}
function nodes(xml:string,name:string):{attrs:string;body:string}[]{
 const re=new RegExp("<"+name+"\\b([^>]*?)>([\\s\\S]*?)<\\/"+name+"\\s*>","gu");
 return [...xml.matchAll(re)].map(m=>({attrs:m[1],body:m[2]}));
}
function tags(xml:string,name:string):string[]{
 return [...xml.matchAll(new RegExp("<"+name+"\\b([^>]*?)\\s*\\/?>","gu"))].map(m=>m[1]);
}
function attr(attrs:string,name:string):string|undefined{
 const m=new RegExp("(?:^|\\s)"+name+'\\s*=\\s*["\']([^"\']*)["\']',"u").exec(attrs);
 return m?xmlDecode(m[1]):undefined;
}
function textParts(s:string):string{return nodes(s,"t").map(n=>xmlDecode(n.body)).join("");}
function checkXml(s:string,max:number):void{
 if(s.length>max||/<\s*!(?:DOCTYPE|ENTITY)/iu.test(s))
   throw Error("XLSX XML is too large or contains unsupported document/entity declarations.");
}
async function readXml(zip:JSZip,path:string,max:number):Promise<string>{
 const f=zip.file(path);if(!f||f.dir)throw Error("XLSX missing "+path);
 type Stream={on:(event:"data"|"end"|"error",handler:(value:any)=>void)=>Stream;pause:()=>void;resume:()=>void};
 const stream=(f as JSZip.JSZipObject&{internalStream:(type:string)=>Stream}).internalStream("uint8array");
 return new Promise((resolve,reject)=>{
   const chunks:Uint8Array[]=[];let length=0,ended=false;
   const fail=(s:string)=>{if(ended)return;ended=true;stream.pause();reject(Error(s));};
   stream.on("data",(piece:Uint8Array)=>{
     if(ended)return;length+=piece.length;
     if(length>max){fail("Decompressed worksheet exceeds "+max+" bytes.");return;}
     chunks.push(Uint8Array.from(piece));
   });
   stream.on("error",(error:Error)=>fail("XLSX decompression failed: "+error.message));
   stream.on("end",()=>{
     if(ended)return;ended=true;
     const bytes=new Uint8Array(length);let offset=0;
     for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
     try{const xml=utf8.decode(bytes);checkXml(xml,max);resolve(xml);}catch(e){reject(e);}
   });
   stream.resume();
 });
}
function worksheetPath(workbook:string,rels:string):{path:string;name:string;count:number}{
 const sheets=tags(workbook,"sheet");
 if(!sheets.length)throw Error("Workbook has no sheets.");
 const id=attr(sheets[0],"r:id"),name=attr(sheets[0],"name")??"Sheet1";
 const relationship=tags(rels,"Relationship").find(s=>attr(s,"Id")===id);
 if(!relationship||(attr(relationship,"Type")??"").endsWith("/worksheet")===false)
   throw Error("Missing worksheet relationship.");
 const target=attr(relationship,"Target")??"";
 const relative=target.startsWith("/xl/")?target.slice(4):target;
 if(!/^worksheets\/sheet\d+\.xml$/u.test(relative))
   throw Error("Unsupported or unsafe worksheet target.");
 return {path:"xl/"+relative,name,count:sheets.length};
}
function parseWorksheet(xml:string,shared:string[]):DataTable{
 const body=nodes(xml,"sheetData")[0]?.body;
 if(body===undefined)throw Error("Sheet has no rows.");
 const map=new Map<number,Map<number,string>>();let total=0;
 for(const row of nodes(body,"row")){
   const number=Number(attr(row.attrs,"r"));
   if(!Number.isSafeInteger(number)||number<1||number>MAX_ROWS+1||map.has(number))
     throw Error("Invalid or repeated worksheet row.");
   const cells=new Map<number,string>();
   for(const cell of nodes(row.body,"c")){
     const ref=attr(cell.attrs,"r"),m=/^([A-Z]{1,2})([1-9]\d*)$/u.exec(ref??"");
     if(!m||Number(m[2])!==number)throw Error("Unsupported cell reference.");
     const column=[...m[1]].reduce((x,ch)=>x*26+ch.charCodeAt(0)-64,0)-1;
     if(column>=MAX_COLS||cells.has(column))throw Error("Too many or duplicate XLSX cells.");
     const type=attr(cell.attrs,"t")??"n",v=nodes(cell.body,"v")[0]?.body;
     let value="";
     if(type==="inlineStr")value=textParts(nodes(cell.body,"is")[0]?.body??"");
     else if(type==="s"){
       const index=Number(v);
       if(!Number.isSafeInteger(index)||index<0||index>=shared.length)
         throw Error("Invalid XLSX shared string index.");
       value=shared[index];
     }else if(type==="b")value=v==="1"?"TRUE":"FALSE";
     else if(["n","str","e","d"].includes(type)){
       if(/<f(?:\s|>)/u.test(cell.body)&&v===undefined)
         throw Error("Formula cell has no cached result; open and recalculate in a spreadsheet editor.");
       value=v===undefined?"":xmlDecode(v);
     }else throw Error("Unsupported XLSX cell type: "+type);
     checked(value);total+=value.length;
     if(total>600_000)throw Error("XLSX text exceeds 600,000 characters.");
     cells.set(column,value);
   }
   map.set(number,cells);
 }
 if(!map.size)throw Error("XLSX has no nonempty worksheet rows.");
 const maxRow=Math.max(...map.keys());
 const maxCol=Math.max(0,...[...map.values()].flatMap(c=>[...c.keys()]));
 const rows=Array.from({length:maxRow},(_,r)=>Array.from({length:maxCol+1},(_,c)=>map.get(r+1)?.get(c)??""));
 return makeDataTable(rows,true);
}
export async function xlsxToTable(source:Uint8Array):Promise<{table:DataTable;sheetName:string;sheetCount:number}>{
 if(source.length<100||source.length>MAX_INPUT)throw Error("XLSX input must be 100 bytes–4 MB.");
 const info=inspectZip(source);
 if(info.entries.length>100||info.entries.some(e=>e.unsafePath||e.symlink||e.encrypted))
   throw Error("XLSX has unsafe or excessive archive entries.");
 if(info.entries.some(e=>/vbaProject|externalLinks|embeddings\//iu.test(e.name)))
   throw Error("Macros, external links and embedded objects are unsupported.");
 const zip=await JSZip.loadAsync(source,{checkCRC32:false,createFolders:false});
 const workbook=await readXml(zip,"xl/workbook.xml",400_000);
 const rels=await readXml(zip,"xl/_rels/workbook.xml.rels",400_000);
 const sheet=worksheetPath(workbook,rels);
 const strings=zip.file("xl/sharedStrings.xml")?
   nodes(await readXml(zip,"xl/sharedStrings.xml",3_000_000),"si").map(item=>textParts(item.body)):[];
 if(strings.length>50_000)throw Error("Excessive XLSX shared strings.");
 return {table:parseWorksheet(await readXml(zip,sheet.path,8_000_000),strings),
   sheetName:sheet.name,sheetCount:sheet.count};
}
