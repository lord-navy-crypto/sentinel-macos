/** Explicit, bounded local UTF-8 import into the existing QuickKit text editor. */
export const QUICK_TEXT_MAX_BYTES=200_000;
export const QUICK_TEXT_MAX_CHARS=200_000;
export const QUICK_TEXT_EXTENSIONS=/\.(txt|text|md|markdown|csv|tsv|log|json|srt|vtt|ini)$/iu;

export function decodeQuickTextFile(name:string,bytes:Uint8Array):string{
 if(!QUICK_TEXT_EXTENSIONS.test(name))throw Error("Please select a supported text file (TXT, MD, CSV, TSV, LOG, JSON, SRT, VTT or INI).");
 if(bytes.byteLength===0||bytes.byteLength>QUICK_TEXT_MAX_BYTES)
  throw Error("Text file must be 1–200,000 bytes.");
 let text:string;
 try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
 catch{throw Error("Text file is not valid UTF-8. Convert its encoding first using the existing text converter.");}
 if(text.length>QUICK_TEXT_MAX_CHARS)throw Error("Text file exceeds 200,000 characters.");
 if(text.includes("\u0000"))throw Error("Text input contains NUL bytes and may be a binary file.");
 return text;
}
