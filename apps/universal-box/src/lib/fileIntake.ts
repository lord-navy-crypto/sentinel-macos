/** Local File Intake: metadata, magic-byte detection and safe CSV inventories.
 * No file contents or hashes leave the device.
 */
export type FileKind="PDF"|"PNG"|"JPEG"|"GIF"|"WEBP"|"ZIP container"|"WAV"|"Unknown";
export type FileInspection={
 name:string; size:number; kind:FileKind; extension:string;
 sha256:string; mismatch:boolean;
};
export const INSPECT_MAX_FILES=80;
export const INSPECT_MAX_EACH=64_000_000;
export const INSPECT_MAX_TOTAL=160_000_000;
export function sizeLabel(bytes:number):string{
 if(bytes<1000)return bytes+" B";
 if(bytes<1_000_000)return (bytes/1000).toFixed(1)+" KB";
 return (bytes/1_000_000).toFixed(2)+" MB";
}
export function fileKind(prefix:Uint8Array):FileKind{
 const has=(...v:number[])=>v.every((b,i)=>prefix[i]===b);
 if(has(0x25,0x50,0x44,0x46,0x2d))return "PDF";
 if(has(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return "PNG";
 if(has(0xff,0xd8,0xff))return "JPEG";
 if(has(0x47,0x49,0x46,0x38)&&[0x37,0x39].includes(prefix[4])&&prefix[5]===0x61)return "GIF";
 if(has(0x52,0x49,0x46,0x46)&&prefix[8]===0x57&&prefix[9]===0x45&&prefix[10]===0x42&&prefix[11]===0x50)return "WEBP";
 if(has(0x52,0x49,0x46,0x46)&&prefix[8]===0x57&&prefix[9]===0x41&&prefix[10]===0x56&&prefix[11]===0x45)return "WAV";
 if(has(0x50,0x4b,0x03,0x04)||has(0x50,0x4b,0x05,0x06))return "ZIP container";
 return "Unknown";
}
const extensions:Record<Exclude<FileKind,"Unknown">,string[]>={
 PDF:["pdf"],PNG:["png"],JPEG:["jpg","jpeg","jpe"],GIF:["gif"],
 WEBP:["webp"],"ZIP container":["zip","docx","xlsx","pptx","odt","ods","odp","epub","jar"],
 WAV:["wav"]
};
export function mismatchedExtension(kind:FileKind,filename:string):boolean{
 if(kind==="Unknown")return false;
 const ext=filename.split(".").length>1?filename.split(".").pop()!.toLowerCase():"";
 return !extensions[kind].includes(ext);
}
export function hexDigest(bytes:ArrayBuffer):string{
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
export function duplicateGroups(rows:FileInspection[]):FileInspection[][]{
 const groups=new Map<string,FileInspection[]>();
 for(const file of rows){
  const key=file.size+":"+file.sha256;
  groups.set(key,[...(groups.get(key)??[]),file]);
 }
 return [...groups.values()].filter(group=>group.length>1);
}
function safeCsvField(value:string|number):string{
 let text=String(value);
 // Prevent spreadsheet formula execution on CSV import (including leading whitespace).
 if(/^[\s]*[=+@\-]/u.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function inventoryCsv(rows:FileInspection[]):string{
 return "\uFEFF"+[
  ["File name","Bytes","Detected type","Extension","SHA-256","Extension warning"].map(safeCsvField).join(","),
  ...rows.map(row=>[row.name,row.size,row.kind,row.extension,row.sha256,row.mismatch?"YES":"NO"].map(safeCsvField).join(","))
 ].join("\r\n")+"\r\n";
}
