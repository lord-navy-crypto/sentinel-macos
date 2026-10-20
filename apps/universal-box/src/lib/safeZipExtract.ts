/** Selectively inspect, stream-decompress and safely repackage ZIP entries.
 * Never writes archive-supplied paths to the filesystem. Not a malware scanner. */
import JSZip from "jszip";
import {inspectZip,type ZipInspection,type ZipEntry} from "./zipInspector";

const MAX_SELECTED=30,MAX_EXPANDED=12_000_000,MAX_ENTRY=7_000_000,MAX_RATIO=300;
export type SafeZipItem={original:string;safeName:string;declaredSize:number;compressedSize:number};
export type SafeZipPlan={items:SafeZipItem[];inspection:ZipInspection;totalSize:number};

function outputExtension(name:string):string{
 const base=name.split("/").at(-1)??"";
 const match=/\.([a-zA-Z0-9]{1,10})$/u.exec(base);
 return match?"."+match[1].toLowerCase():".bin";
}
function getCrc32Table(){
 const result=new Uint32Array(256);
 for(let n=0;n<256;n++){
   let c=n;
   for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
   result[n]=c>>>0;
 }
 return result;
}
const CRC_TABLE=getCrc32Table();
function crcUpdate(value:number,chunk:Uint8Array):number{
 let c=value;
 for(let i=0;i<chunk.length;i++)c=CRC_TABLE[(c^chunk[i])&255]^(c>>>8);
 return c>>>0;
}
function rejectArchive(inspection:ZipInspection):void{
 if(inspection.entries.length>500)throw Error("Selective extraction supports at most 500 archive entries.");
 if(inspection.warnings.some(w=>/overlap|non-UTF8/u.test(w)))
   throw Error("Ambiguous/overlapping ZIP layout or unsupported filename encoding.");
 if(inspection.entries.some(e=>e.unsafePath||e.symlink||e.encrypted))
   throw Error("Archive contains unsafe paths, symbolic links, or encrypted entries. Use inspect-only mode.");
 const names=new Set<string>();
 for(const entry of inspection.entries){
   const key=entry.name.normalize("NFKC").toLocaleLowerCase();
   if(names.has(key))throw Error("ZIP contains duplicate or normalization-colliding paths.");
   names.add(key);
   if(![0,8].includes(entry.method))throw Error("Archive has an unsupported compression method.");
 }
}
function outputItem(entry:ZipEntry,index:number):SafeZipItem{
 return {original:entry.name,safeName:"extracted/file-"+String(index+1).padStart(3,"0")+outputExtension(entry.name),
   declaredSize:entry.uncompressedBytes,compressedSize:entry.compressedBytes};
}
export function planSafeZipExtraction(
 bytes:Uint8Array, selectedNames:string[],
):SafeZipPlan{
 const inspection=inspectZip(bytes);
 rejectArchive(inspection);
 if(selectedNames.length<1||selectedNames.length>MAX_SELECTED)
   throw Error("Select 1–30 safe regular files.");
 if(new Set(selectedNames).size!==selectedNames.length)
   throw Error("Duplicate selections are not allowed.");
 const files=new Map(inspection.entries.filter(e=>!e.name.endsWith("/")).map(e=>[e.name,e]));
 let totalSize=0;
 const items=selectedNames.map((name,index)=>{
   const entry=files.get(name);
   if(!entry)throw Error("Selected file was not found: "+name);
   if(entry.uncompressedBytes>MAX_ENTRY)throw Error("Selected entry exceeds 7 MB: "+name);
   if(entry.uncompressedBytes>0&&entry.uncompressedBytes/Math.max(1,entry.compressedBytes)>MAX_RATIO)
     throw Error("Selected entry expands over 300×: "+name);
   totalSize+=entry.uncompressedBytes;
   if(totalSize>MAX_EXPANDED)throw Error("Selected files exceed the 12 MB extraction limit.");
   return outputItem(entry,index);
 });
 return {items,inspection,totalSize};
}
type ZipByteStream={
  on(event:"data",handler:(chunk:Uint8Array)=>void):ZipByteStream;
  on(event:"error",handler:(error:Error)=>void):ZipByteStream;
  on(event:"end",handler:()=>void):ZipByteStream;
  pause():void;
  resume():void;
};
// JSZip runtime exposes ZipObject.internalStream; its public TypeScript type omits it.
// Keep the narrow runtime interface here and verify behavior with actual ZIP Vitest fixtures.
/** Stream each member with a strict actual-byte budget rather than calling file.async().
 * Checks observed length and CRC-32 against the original central directory. */
async function readBounded(
 file:JSZip.JSZipObject,expectedSize:number,expectedCrc:number,
):Promise<Uint8Array>{
 return new Promise((resolve,reject)=>{
   const chunks:Uint8Array[]=[];
   let total=0,crc=0xffffffff,settled=false;
   const stream=(file as JSZip.JSZipObject & {internalStream:(type:string)=>ZipByteStream}).internalStream("uint8array");
   const fail=(message:string)=>{
     if(settled)return;
     settled=true;stream.pause();reject(new Error(message));
   };
   stream.on("data",(chunk:Uint8Array)=>{
     if(settled)return;
     total+=chunk.byteLength;
     if(total>expectedSize||total>MAX_ENTRY){fail("Decompressed ZIP entry exceeds its declared/bounded size.");return;}
     const copy=Uint8Array.from(chunk);
     chunks.push(copy);
     crc=crcUpdate(crc,copy);
   });
   stream.on("error",(error:Error)=>fail("Cannot decompress ZIP member: "+error.message));
   stream.on("end",()=>{
     if(settled)return;
     if(total!==expectedSize){fail("ZIP entry length does not match its header.");return;}
     if(((crc^0xffffffff)>>>0)!==expectedCrc){fail("ZIP entry failed CRC-32 integrity check.");return;}
     settled=true;
     const out=new Uint8Array(total);let offset=0;
     for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
     resolve(out);
   });
   stream.resume();
 });
}
export async function safeSelectiveZip(
 source:Uint8Array,selectedNames:string[],onProgress?:(text:string)=>void,
):Promise<{bytes:Uint8Array;count:number}>{
 const plan=planSafeZipExtraction(source,selectedNames);
 const archive=await JSZip.loadAsync(source,{checkCRC32:false,createFolders:false});
 const destination=new JSZip();
 const all=new Map(plan.inspection.entries.map(e=>[e.name,e]));
 for(let i=0;i<plan.items.length;i++){
   const item=plan.items[i],sourceEntry=all.get(item.original)!;
   const file=archive.file(item.original);
   if(!file||file.dir)throw Error("Source file is missing from archive.");
   onProgress?.("Checking and extracting "+(i+1)+"/"+plan.items.length);
   const raw=await readBounded(file,item.declaredSize,sourceEntry.crc32);
   destination.file(item.safeName,raw,{binary:true,createFolders:false});
 }
 destination.file("manifest.json",JSON.stringify({
   source:"Universal Box safe selective ZIP export",createdAt:new Date().toISOString(),
   files:plan.items.map(item=>({
     original:item.original,output:item.safeName,size:item.declaredSize,
   })),
 },null,2));
 onProgress?.("Creating new safe ZIP archive");
 const output=await destination.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(output.length>20_000_000)throw Error("Result exceeds 20 MB save limit.");
 return {bytes:output,count:plan.items.length};
}
