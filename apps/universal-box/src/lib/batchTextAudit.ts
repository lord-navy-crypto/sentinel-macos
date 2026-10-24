/** Read-only batch UTF-8 text inventory. CSV contains metadata only, not original file contents. */
import {type BatchTextSource,validateBatchTextSelection} from "./batchTextFiles";

export type TextFileAudit={
  name:string;extension:string;bytes:number;characters:number;
  lines:number;nonBlankLines:number;blankLines:number;
  crlf:number;lf:number;cr:number;trailingSpaceLines:number;utf8Bom:boolean;
};
const decoder=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true});
const encoder=new TextEncoder();
const hasBom=(bytes:Uint8Array)=>bytes.length>=3&&bytes[0]===239&&bytes[1]===187&&bytes[2]===191;

export function auditTextFiles(sources:readonly BatchTextSource[]):TextFileAudit[]{
  validateBatchTextSelection(sources.map(f=>({name:f.name,size:f.bytes.length})));
  return sources.map(file=>{
    const bom=hasBom(file.bytes);
    let text:string;
    try{text=decoder.decode(bom?file.bytes.subarray(3):file.bytes);}
    catch{throw Error(file.name+": invalid UTF-8; cannot audit as text.");}
    if(text.includes("\u0000"))throw Error(file.name+": NUL/binary data is not supported.");
    const endings=text.match(/\r\n|\r|\n/gu)??[];
    const crlf=endings.filter(x=>x==="\r\n").length;
    const lf=endings.filter(x=>x==="\n").length;
    const cr=endings.filter(x=>x==="\r").length;
    // A final newline terminates its preceding line; it is not an extra physical line.
    const physical=text.length===0?[]:text.split(/\r\n|\r|\n/u);
    if(endings.length&&physical.at(-1)==="")physical.pop();
    const blankLines=physical.filter(x=>/^[ \t]*$/u.test(x)).length;
    const trailingSpaceLines=physical.filter(x=>/[ \t]$/u.test(x)).length;
    return {
      name:file.name,extension:file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
      bytes:file.bytes.length,characters:Array.from(text).length,
      lines:physical.length,nonBlankLines:physical.length-blankLines,blankLines,
      crlf,lf,cr,trailingSpaceLines,utf8Bom:bom,
    };
  });
}
export const TEXT_AUDIT_COLUMNS=[
  "File","Extension","UTF-8 bytes","Unicode code points","Physical lines","Nonblank lines",
  "Blank lines","CRLF endings","LF endings","CR endings","Trailing whitespace lines","UTF-8 BOM"
] as const;

function protectSpreadsheetCell(value:string):string{
  // Filename text can be interpreted as an Excel/LibreOffice formula. Quote + prefix apostrophe.
  // Reject every C0/C1 control and BOM in a source name through standard selection validation.
  const safe=/^[\s]*[=+\-@]/u.test(value)?"'"+value:value;
  return '"'+safe.replace(/"/gu,'""')+'"';
}
export function makeTextAuditCsv(rows:readonly TextFileAudit[]):Uint8Array{
  if(rows.length<1||rows.length>20)throw Error("Select at least one audited file.");
  const records=[TEXT_AUDIT_COLUMNS.map(protectSpreadsheetCell).join(",")];
  for(const r of rows){
    const values=[
      r.name,r.extension,r.bytes,r.characters,r.lines,r.nonBlankLines,r.blankLines,
      r.crlf,r.lf,r.cr,r.trailingSpaceLines,r.utf8Bom?"Yes":"No"
    ];
    records.push(values.map(value=>protectSpreadsheetCell(String(value))).join(","));
  }
  // UTF-8 BOM helps desktop spreadsheet programs open Chinese filenames correctly.
  return encoder.encode("\ufeff"+records.join("\r\n")+"\r\n");
}
