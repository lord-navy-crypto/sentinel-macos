/** Three opt-in, offline-first workflows. No filesystem enumeration or network calls. */
import JSZip from "jszip";
import {parseWorkspaceCsv} from "./csvCleanroom";
import {mergedCsvExport} from "./csvMerge";

const xml=(s:string)=>s.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;")
 .replace(/"/gu,"&quot;").replace(/'/gu,"&apos;");
export async function createTextEpub(input:string,title:string,author:string):Promise<Uint8Array>{
 if(!input.trim()||input.length>300_000)throw Error("Choose 1–300,000 characters of UTF-8 text.");
 if(!title.trim()||title.length>120||author.length>120)throw Error("Title and author must be at most 120 characters; title cannot be blank.");
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input+title+author))
  throw Error("Unsupported control characters in the book.");
 const lines=input.replace(/\r\n?/gu,"\n").split("\n");
 const chapters:{title:string;lines:string[]}[]=[];
 let current:{title:string;lines:string[]}|null=null;
 for(const line of lines){
  const heading=/^#{1,2}\s+(.+)$/u.exec(line);
  if(heading){
   if(chapters.length>=30)throw Error("EPUB supports up to 30 chapters.");
   current={title:heading[1].trim().slice(0,120),lines:[]};chapters.push(current);
  }else{
   if(!current){current={title:"Chapter 1",lines:[]};chapters.push(current);}
   current.lines.push(line);
  }
 }
 if(!chapters.length)throw Error("No book contents found.");
 const zip=new JSZip();
 // EPUB OCF requires the uncompressed mimetype file as the first ZIP entry.
 zip.file("mimetype","application/epub+zip",{compression:"STORE"});
 zip.file("META-INF/container.xml",'<?xml version="1.0" encoding="utf-8"?>'
  +'<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
  +'<rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>'
  +'</rootfiles></container>');
 const itemRefs:string[]=[],spine:string[]=[],nav:string[]=[];
 for(let i=0;i<chapters.length;i++){
  const c=chapters[i],id="chapter"+(i+1),file=id+".xhtml";
  const paragraphs=c.lines.join("\n").trim().split(/\n{2,}/u).filter(Boolean);
  const body=paragraphs.map(p=>"<p>"+p.split("\n").map(xml).join("<br/>")+"</p>").join("\n");
  zip.file("OEBPS/"+file,'<?xml version="1.0" encoding="utf-8"?>'
   +'<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="und"><head><title>'+xml(c.title)
   +'</title></head><body><h1>'+xml(c.title)+'</h1>'+body+'</body></html>');
  itemRefs.push('<item id="'+id+'" href="'+file+'" media-type="application/xhtml+xml"/>');
  spine.push('<itemref idref="'+id+'"/>');
  nav.push('<li><a href="'+file+'">'+xml(c.title)+'</a></li>');
 }
 zip.file("OEBPS/nav.xhtml",'<?xml version="1.0" encoding="utf-8"?>'
  +'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
  +'<head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1>'
  +'<ol>'+nav.join("")+'</ol></nav></body></html>');
 const uuid=crypto.randomUUID();
 zip.file("OEBPS/package.opf",'<?xml version="1.0" encoding="utf-8"?>'
  +'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">'
  +'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:'+uuid
  +'</dc:identifier><dc:title>'+xml(title.trim())+'</dc:title><dc:creator>'+xml(author.trim()||"Unknown")
  +'</dc:creator><dc:language>und</dc:language><meta property="dcterms:modified">'
  +new Date().toISOString().replace(/\.\d{3}Z$/u,"Z")+'</meta></metadata><manifest>'
  +'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
  +itemRefs.join("")+'</manifest><spine>'+spine.join("")+'</spine></package>');
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
 if(bytes.length>20_000_000)throw Error("EPUB output exceeds 20 MB.");
 return bytes;
}

export type IntegrityFile={name:string;bytes:Uint8Array};
export type FileDigest={name:string;size:number;sha256:string};
export type IntegrityManifest={version:1;algorithm:"SHA-256";files:FileDigest[]};
function validateFiles(files:readonly IntegrityFile[]):void{
 if(files.length<1||files.length>30)throw Error("Select 1–30 files.");
 const names=new Set<string>();let total=0;
 for(const f of files){
  if(!f.name||f.name.length>200||/[\\/\u0000-\u001f]/u.test(f.name)||names.has(f.name))
   throw Error("Duplicate or unsafe filename. Rename files before hashing.");
  names.add(f.name);total+=f.bytes.length;
  if(f.bytes.length>12_000_000||total>40_000_000)throw Error("File limit: 12 MB each, 40 MB total.");
 }
}
async function digest(bytes:Uint8Array):Promise<string>{
 if(!globalThis.crypto?.subtle)throw Error("Local SHA-256 needs WebCrypto in a secure app context.");
 const raw=await crypto.subtle.digest("SHA-256",Uint8Array.from(bytes));
 return [...new Uint8Array(raw)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export async function createIntegrityManifest(files:readonly IntegrityFile[]):Promise<IntegrityManifest>{
 validateFiles(files);
 const result:FileDigest[]=[];
 for(const f of files)result.push({name:f.name,size:f.bytes.length,sha256:await digest(f.bytes)});
 return {version:1,algorithm:"SHA-256",files:result};
}
export function parseIntegrityManifest(source:string):IntegrityManifest{
 if(source.length>30_000)throw Error("Manifest too large.");
 let obj:unknown;
 try{obj=JSON.parse(source);}catch{throw Error("Invalid JSON manifest.");}
 if(!obj||typeof obj!=="object"||Array.isArray(obj))throw Error("Not a valid integrity manifest.");
 const m=obj as Partial<IntegrityManifest>;
 if(m.version!==1||m.algorithm!=="SHA-256"||!Array.isArray(m.files)||m.files.length<1||m.files.length>30)
  throw Error("Unsupported manifest version or algorithm.");
 const names=new Set<string>();
 for(const f of m.files){
  if(!f||typeof f.name!=="string"||!f.name||f.name.length>200
   ||/[\\/\u0000-\u001f]/u.test(f.name)||names.has(f.name)
   ||!Number.isSafeInteger(f.size)||f.size<0||f.size>12_000_000
   ||typeof f.sha256!=="string"||!/^[a-f0-9]{64}$/u.test(f.sha256))
   throw Error("Manifest has unsafe or invalid file details.");
  names.add(f.name);
 }
 return m as IntegrityManifest;
}
export type IntegrityResult={matches:string[];modified:string[];missing:string[];extra:string[]};
export async function verifyIntegrityManifest(manifest:IntegrityManifest,files:readonly IntegrityFile[]):Promise<IntegrityResult>{
 const expected=parseIntegrityManifest(JSON.stringify(manifest));
 validateFiles(files);
 const byName=new Map(files.map(f=>[f.name,f]));
 const result:IntegrityResult={matches:[],modified:[],missing:[],extra:[]};
 for(const entry of expected.files){
  const found=byName.get(entry.name);
  if(!found){result.missing.push(entry.name);continue;}
  const actual=await digest(found.bytes);
  (found.bytes.length===entry.size&&actual===entry.sha256?result.matches:result.modified).push(entry.name);
 }
 const expectedNames=new Set(expected.files.map(f=>f.name));
 result.extra=files.filter(f=>!expectedNames.has(f.name)).map(f=>f.name);
 return result;
}

export type CsvCellChange={rowId:string;kind:"added"|"removed"|"cell";column:string;before:string;after:string};
export type CsvSnapshotDiff={addedColumns:string[];removedColumns:string[];addedRows:number;removedRows:number;
 changedRows:number;unchangedRows:number;changes:CsvCellChange[]};
function snapshot(text:string,key:string){
 if(text.length>550_000)throw Error("Each CSV snapshot must be at most 550,000 characters.");
 const raw=parseWorkspaceCsv(text);
 const header=raw[0];
 if(!header||header.length<1||header.some(c=>!c.trim())||new Set(header).size!==header.length)
  throw Error("CSV header must contain unique nonempty column names.");
 const keyIndex=header.indexOf(key);
 if(keyIndex<0)throw Error("Key column missing: "+key);
 const rows=new Map<string,string[]>();
 if(raw.length>3001)throw Error("CSV diff supports 3,000 data rows per snapshot.");
 for(const original of raw.slice(1)){
  if(original.length!==header.length)throw Error("CSV row has a different number of columns.");
  const id=original[keyIndex];
  if(!id.trim()||rows.has(id))throw Error("Empty or duplicate ID in key column: "+key);
  rows.set(id,original);
 }
 return {header,rows};
}
export function compareCsvSnapshots(before:string,after:string,key:string):CsvSnapshotDiff{
 if(!key||key.length>120)throw Error("Choose an existing key column.");
 const old=snapshot(before,key),next=snapshot(after,key);
 const addedColumns=next.header.filter(c=>!old.header.includes(c));
 const removedColumns=old.header.filter(c=>!next.header.includes(c));
 const common=old.header.filter(c=>next.header.includes(c)&&c!==key);
 const oldIx=new Map(old.header.map((c,i)=>[c,i])),newIx=new Map(next.header.map((c,i)=>[c,i]));
 const changes:CsvCellChange[]=[];let addedRows=0,removedRows=0,changedRows=0,unchangedRows=0;
 const add=(change:CsvCellChange)=>{if(changes.length>=15000)throw Error("Too many changes for safe export.");changes.push(change);};
 for(const [id,row] of old.rows){
  const corresponding=next.rows.get(id);
  if(!corresponding){removedRows++;add({rowId:id,kind:"removed",column:"",before:"",after:""});continue;}
  let changed=false;
  for(const col of common){
   const a=row[oldIx.get(col)!],b=corresponding[newIx.get(col)!];
   if(a!==b){changed=true;add({rowId:id,kind:"cell",column:col,before:a,after:b});}
  }
  if(changed)changedRows++;else unchangedRows++;
 }
 for(const id of next.rows.keys()){
  if(!old.rows.has(id)){addedRows++;add({rowId:id,kind:"added",column:"",before:"",after:""});}
 }
 return {addedColumns,removedColumns,addedRows,removedRows,changedRows,unchangedRows,changes};
}
export async function exportCsvSnapshotDiff(result:CsvSnapshotDiff):Promise<Uint8Array>{
 const zip=new JSZip();
 zip.file("csv-diff/changes.csv","\uFEFF"+mergedCsvExport({headers:["row_id","change","column","before","after"],
  rows:result.changes.map(c=>[c.rowId,c.kind,c.column,c.before,c.after])}));
 zip.file("csv-diff/report.json",JSON.stringify(result,null,2));
 zip.file("csv-diff/README.txt","Two user-supplied CSV snapshots compared by unique string key. No formulas executed. Data remains local; review exported values before sharing.\n");
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
 if(bytes.length>20_000_000)throw Error("Diff ZIP exceeds 20 MB.");
 return bytes;
}
