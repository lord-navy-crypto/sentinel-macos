/** Practical Windows/macOS text exchange: user-selected files, explicit encoding and line ending.
 * Does not pretend to convert executable Windows apps or proprietary document layouts.
 */
import JSZip from "jszip";
export type SourceCharset="auto"|"utf-8"|"utf-16le"|"utf-16be"|"windows-1252"|"gb18030"|"shift_jis";
export type OutputCharset="utf-8"|"utf-8-bom"|"utf-16le-bom";
export type LineStyle="lf"|"crlf";
export type PortableInput={name:string;bytes:Uint8Array};
export type PortableSettings={source:SourceCharset;target:OutputCharset;lines:LineStyle};
export type PortableReport={source:string;destination:string;inputBytes:number;outputBytes:number;encoding:string;lineEnding:LineStyle};
const decoderLabels:Record<Exclude<SourceCharset,"auto">,string>={
 "utf-8":"utf-8","utf-16le":"utf-16le","utf-16be":"utf-16be",
 "windows-1252":"windows-1252","gb18030":"gb18030","shift_jis":"shift_jis",
};
const clean=(name:string)=>name.normalize("NFC").replace(/[\\/:*?"<>|\x00-\x1f\x7f]/gu,"_").slice(0,90);
export function planPortable(files:readonly {name:string;size:number}[],settings:PortableSettings){
 if(files.length<1||files.length>20)throw Error("Select 1–20 text files.");
 if(!["auto","utf-8","utf-16le","utf-16be","windows-1252","gb18030","shift_jis"].includes(settings.source)
  ||!["utf-8","utf-8-bom","utf-16le-bom"].includes(settings.target)
  ||!["lf","crlf"].includes(settings.lines))throw Error("Unsupported encoding or line ending choice.");
 let total=0;
 for(const file of files){
  if(!/\.(txt|csv|md|tsv|json|srt|vtt|ini|log)$/iu.test(file.name)
   ||file.size<1||file.size>1_000_000)throw Error("Choose 1-byte–1 MB text/CSV/Markdown/subtitle files.");
  total+=file.size;
  if(total>8_000_000)throw Error("Text conversion batch exceeds 8 MB.");
 }
 return files.length;
}
export function decodePortable(bytes:Uint8Array,source:SourceCharset):{text:string;encoding:string}{
 let encoding:Exclude<SourceCharset,"auto">=source==="auto"?"utf-8":source;
 let offset=0;
 if(source==="auto"){
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf){encoding="utf-8";offset=3;}
  else if(bytes[0]===0xff&&bytes[1]===0xfe){encoding="utf-16le";offset=2;}
  else if(bytes[0]===0xfe&&bytes[1]===0xff){encoding="utf-16be";offset=2;}
  // No encoding guess without BOM: UTF-8 is the only safe auto default.
 }
 const text=new TextDecoder(decoderLabels[encoding],{fatal:true}).decode(bytes.subarray(offset)).replace(/^\uFEFF/u,"");
 if(text.includes("\u0000")||/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))
  throw Error("Input appears to be binary or contains unsupported control characters.");
 return {text,encoding};
}
export function encodePortable(text:string,settings:Pick<PortableSettings,"target"|"lines">):Uint8Array{
 const normalized=text.replace(/\r\n|\r|\n/gu,"\n").replace(/\n/gu,settings.lines==="crlf"?"\r\n":"\n");
 if(settings.target==="utf-8")return new TextEncoder().encode(normalized);
 if(settings.target==="utf-8-bom"){
  const content=new TextEncoder().encode(normalized),out=new Uint8Array(content.length+3);
  out.set([0xef,0xbb,0xbf]);out.set(content,3);return out;
 }
 if(settings.target!=="utf-16le-bom")throw Error("Unsupported target encoding.");
 const out=new Uint8Array(2+normalized.length*2);out.set([0xff,0xfe]);
 for(let i=0;i<normalized.length;i++){
  const unit=normalized.charCodeAt(i);out[2+i*2]=unit&255;out[3+i*2]=unit>>8;
 }
 return out;
}
export async function exportPortableText(files:readonly PortableInput[],settings:PortableSettings):
 Promise<{zip:Uint8Array;reports:PortableReport[]}>{
 planPortable(files.map(f=>({name:f.name,size:f.bytes.length})),settings);
 const bundle=new JSZip(),reports:PortableReport[]=[];
 for(let i=0;i<files.length;i++){
  const input=files[i];
  const decoded=decodePortable(input.bytes,settings.source);
  const output=encodePortable(decoded.text,settings);
  if(output.length>3_000_000)throw Error("One converted text file exceeds the 3 MB output limit.");
  const name="converted/"+String(i+1).padStart(3,"0")+"-"+clean(input.name);
  bundle.file(name,output);
  reports.push({source:input.name,destination:name,inputBytes:input.bytes.length,
   outputBytes:output.length,encoding:decoded.encoding,lineEnding:settings.lines});
 }
 bundle.file("reports/manifest.json",JSON.stringify({generator:"Sentinel Box",format:"cross-OS text conversion v1",
  settings,files:reports,originalsIncluded:false},null,2));
 bundle.file("reports/README.txt","Offline Windows/macOS text encoding & line-ending conversion. Check file content and encoding. This does not convert proprietary application files or preserve special metadata.\n");
 const zip=await bundle.generateAsync({type:"uint8array",compression:"DEFLATE"});
 if(zip.length>20_000_000)throw Error("Converted text archive exceeds 20 MB.");
 return {zip,reports};
}
