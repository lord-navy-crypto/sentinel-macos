/** A bounded, user-initiated cross-tool pipeline. No cloud API or filesystem scanning. */
import JSZip from "jszip";
import {markdownToDocx} from "./documentExport";
import {cleanWorkspaceCsv,DEFAULT_CSV_CLEANUP} from "./csvCleanroom";
import {auditJsonToTypescript} from "./jsonTypeStudio";
import {inspectOffice} from "./officeInspector";
import {fileKind} from "./fileIntake";
import {imageWorkflowScale} from "./imageWorkflow";

export type UnifiedAction="text-to-word"|"csv-clean"|"json-to-types"|"office-to-text"|"image-normalize"|"archive-only";
export type UnifiedSource={name:string;size:number;type?:string;arrayBuffer():Promise<ArrayBuffer>};
export type UnifiedPlanItem={index:number;name:string;bytes:number;action:UnifiedAction;label:string};
export type UnifiedOptions={
 includeOriginals:boolean;imageMaxDimension:512|1024|2048;
};
export type UnifiedImageAdapter=(bytes:Uint8Array,source:string,maxDimension:512|1024|2048)=>Promise<Uint8Array>;
export type UnifiedRecord={
 index:number;source:string;sourceBytes:number;sha256:string;action:UnifiedAction;
 status:"processed"|"archived"|"skipped"|"failed";
 outputs:string[];notes:string[];error?:string;
};
export type UnifiedManifest={
 generator:"Sentinel Box";version:1;options:UnifiedOptions;files:UnifiedRecord[];
 processed:number;archived:number;skipped:number;failed:number;
};
export type UnifiedResult={archive:Uint8Array;manifest:UnifiedManifest;entries:string[]};
const ACTIONS:Record<UnifiedAction,string>={
 "text-to-word":"Markdown or plain text → editable Word DOCX",
 "csv-clean":"CSV → trimmed, deduplicated, formula-safe CSV",
 "json-to-types":"JSON → TypeScript types + TSV path report",
 "office-to-text":"Word/PowerPoint → extracted text",
 "image-normalize":"Image → normalized PNG",
 "archive-only":"No conversion; optionally archive the original",
};
const allowedActions:Record<string,UnifiedAction>={
 txt:"text-to-word",md:"text-to-word",csv:"csv-clean",json:"json-to-types",
 docx:"office-to-text",pptx:"office-to-text",
 png:"image-normalize",jpg:"image-normalize",jpeg:"image-normalize",webp:"image-normalize"
};
const MAX_FILES=16,MAX_EACH=8_000_000,MAX_TOTAL=16_000_000,MAX_OUTPUT=20_000_000;
const encoder=new TextEncoder();
function ext(filename:string){return filename.includes(".")?filename.split(".").pop()!.toLowerCase():"";}
function cleanName(filename:string){
 const normalized=filename.normalize("NFC").replace(/[\\/<>:"|?*\u0000-\u001f\u007f]/gu,"_").trim();
 const stem=normalized.replace(/\.[^./]+$/u,"").replace(/^\.+/u,"_").slice(0,70);
 return stem||"file";
}
function serial(index:number){return String(index+1).padStart(3,"0");}
function decode(bytes:Uint8Array){
 const source=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 if(source.length>2_000_000)throw Error("Text exceeds the local processing limit.");
 return source.replace(/^\uFEFF/u,"");
}
function verifyKnownSignature(filename:string,bytes:Uint8Array,action:UnifiedAction):void{
 if(action==="archive-only"||action==="csv-clean"||action==="json-to-types"||action==="text-to-word")return;
 const kind=fileKind(bytes.subarray(0,16));
 if(action==="office-to-text"&&kind!=="ZIP container")throw Error("Office extension does not match ZIP package signature.");
 if(action==="image-normalize"){
  const expected:Record<string,string>={png:"PNG",jpg:"JPEG",jpeg:"JPEG",webp:"WEBP"};
  if(expected[ext(filename)]!==kind)throw Error("Image content signature does not match filename extension.");
 }
}
async function sha256(bytes:Uint8Array):Promise<string>{
 const digest=await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
/** Preflight from metadata only; never reads file bytes or guesses a supported conversion. */
export function planUnifiedFiles(files:readonly {name:string;size:number}[]):UnifiedPlanItem[]{
 if(files.length<1||files.length>MAX_FILES)throw Error("Select 1–16 files explicitly.");
 let total=0;
 return files.map((source,index)=>{
  if(!source.name||source.name.length>255||!Number.isSafeInteger(source.size)
   ||source.size<1||source.size>MAX_EACH)throw Error("Each file needs a valid name and must be 1 byte–8 MB.");
  total+=source.size;if(total>MAX_TOTAL)throw Error("Selection exceeds 16 MB total.");
  const action=allowedActions[ext(source.name)]??"archive-only";
  return {index,name:source.name,bytes:source.size,action,label:ACTIONS[action]};
 });
}
export function validateUnifiedOptions(value:UnifiedOptions):void{
 if(typeof value.includeOriginals!=="boolean"||![512,1024,2048].includes(value.imageMaxDimension)){
  throw Error("Invalid unified workflow settings.");
 }
}
/** Actually executes each selected operation in sequence and never silently hides failures. */
export async function buildUnifiedWorkflow(
 files:readonly UnifiedSource[],options:UnifiedOptions,
 convertImage?:UnifiedImageAdapter,onProgress?:(message:string)=>void
):Promise<UnifiedResult>{
 const plan=planUnifiedFiles(files);
 validateUnifiedOptions(options);
 const zip=new JSZip(),records:UnifiedRecord[]=[];
 for(const item of plan){
  onProgress?.("Processing "+(item.index+1)+"/"+plan.length+": "+item.name);
  const record:UnifiedRecord={
   index:item.index,source:item.name,sourceBytes:item.bytes,sha256:"",
   action:item.action,status:"skipped",outputs:[],notes:[]
  };
  records.push(record);
  const stem=serial(item.index)+"-"+cleanName(item.name);
  try{
   const bytes=new Uint8Array(await files[item.index].arrayBuffer());
   if(bytes.length!==item.bytes)throw Error("Input file size changed after selection.");
   record.sha256=await sha256(bytes);
   verifyKnownSignature(item.name,bytes,item.action);
   if(options.includeOriginals){
    const name="originals/"+serial(item.index)+"-"+cleanName(item.name)+"."+ (ext(item.name)||"bin");
    zip.file(name,bytes);record.outputs.push(name);
   }
   const put=(suffix:string,value:Uint8Array|string)=>{
    const path="processed/"+stem+suffix;
    zip.file(path,value);record.outputs.push(path);
   };
   if(item.action==="archive-only"){
    record.status=options.includeOriginals?"archived":"skipped";
    record.notes.push(options.includeOriginals?
     "No conversion available; kept user-selected original as-is.":
     "No safe conversion is available; no original was copied.");
   }else if(item.action==="text-to-word"){
    const text=decode(bytes);
    if(!text.trim())throw Error("Empty text document.");
    put(".docx",await markdownToDocx(text));record.status="processed";
   }else if(item.action==="csv-clean"){
    const cleaned=cleanWorkspaceCsv(decode(bytes),DEFAULT_CSV_CLEANUP);
    put(".clean.csv",cleaned.csv);
    record.notes.push("Cleaned "+cleaned.keptRows+" data rows; removed "+cleaned.removedRows+" blank/duplicate rows.");
    record.status="processed";
   }else if(item.action==="json-to-types"){
    const report=auditJsonToTypescript(decode(bytes));
    put(".ts",report.typeScript);put(".paths.tsv",report.paths);
    record.notes.push("Inferred "+report.valueCount+" observed JSON nodes; not a runtime type validator.");
    record.status="processed";
   }else if(item.action==="office-to-text"){
    const report=await inspectOffice(item.name,bytes);
    put(".extracted.txt",report.plainText);
    record.notes.push("Read "+report.sections.length+" Office text sections; layout and images not retained.");
    record.status="processed";
   }else if(item.action==="image-normalize"){
    if(!convertImage)throw Error("A browser image decoder is required to normalize image pixels.");
    const converted=await convertImage(bytes,item.name,options.imageMaxDimension);
    if(!converted.length||converted.length>MAX_EACH||fileKind(converted.subarray(0,16))!=="PNG"){
     throw Error("Image converter did not return a valid bounded PNG.");
    }
    put(".png",converted);
    record.notes.push("Image re-encoded to a normalized PNG; image metadata may change.");
    record.status="processed";
   }
  }catch(e){
   record.status="failed";
   record.error=e instanceof Error?e.message:String(e);
   record.notes.push("This input was not successfully converted.");
   // If user chose original preservation, it remains clearly marked in the manifest.
  }
 }
 const counts={
  processed:records.filter(r=>r.status==="processed").length,
  archived:records.filter(r=>r.status==="archived").length,
  skipped:records.filter(r=>r.status==="skipped").length,
  failed:records.filter(r=>r.status==="failed").length,
 };
 const manifest:UnifiedManifest={generator:"Sentinel Box",version:1,options:{...options},files:records,...counts};
 zip.file("reports/manifest.json",JSON.stringify(manifest,null,2));
 zip.file("reports/README.txt",
  "Sentinel Box — unified offline workflow\n"
  +"This ZIP contains only user-selected sources (when opted in) and newly generated outputs.\n"
  +"Check reports/manifest.json for per-file operations, SHA-256 input digests, failures and warnings.\n"
  +"Unsupported types are not converted or executed. Original files were not altered.\n"
  +"Image conversion and Office text extraction do not guarantee preservation of formatting or metadata.\n");
 const result=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(result.length>MAX_OUTPUT)throw Error("Unified workflow ZIP exceeds 20 MB; use smaller inputs.");
 return {archive:result,manifest,entries:Object.keys(zip.files).filter(x=>!zip.files[x].dir)};
}
/** An adapter for browser/WebView Canvas. Image bounds reuse Sentinel Box's existing image workflow. */
export async function normalizeImageOnCanvas(bytes:Uint8Array,name:string,maxDimension:512|1024|2048):Promise<Uint8Array>{
 if(typeof document==="undefined"||typeof Image==="undefined")throw Error("Image decoder unavailable.");
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"image/"+(ext(name)==="jpg"?"jpeg":ext(name))}));
 const image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();image.onerror=()=>reject(Error("Image could not be decoded."));
   image.src=url;
  });
  const shape=imageWorkflowScale(image.naturalWidth,image.naturalHeight,maxDimension);
  const canvas=document.createElement("canvas");canvas.width=shape.width;canvas.height=shape.height;
  const context=canvas.getContext("2d");if(!context)throw Error("Canvas unavailable.");
  context.drawImage(image,0,0,shape.width,shape.height);
  const blob=await new Promise<Blob>((resolve,reject)=>{
   canvas.toBlob(b=>b&&b.type==="image/png"?resolve(b):reject(Error("PNG encoding unsupported.")),"image/png");
  });
  canvas.width=0;canvas.height=0;
  return new Uint8Array(await blob.arrayBuffer());
 }finally{URL.revokeObjectURL(url);}
}
