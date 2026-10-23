/** Explicit, offline processing of bounded UTF-8 office text files. Never overwrites originals. */
import JSZip from "jszip";
import {replaceTextLiteral} from "./quickBatchText";

export type BatchTextMode="replace"|"lf"|"crlf"|"remove-bom"|"trim-trailing"|"remove-blank"|"dedupe-lines"|"multi-replace"|"prefix-lines"|"suffix-lines";
export type BatchTextSource={name:string;bytes:Uint8Array};
export type BatchTextResult={
  name:string;outputName:string;matches:number;changed:boolean;ruleCounts?:number[];
  beforeBytes:number;afterBytes:number;preview:string;bytes:Uint8Array;
};
const EXT=/\.(txt|md|markdown|csv|tsv)$/iu;
const MAX_FILES=20,MAX_FILE_BYTES=200_000,MAX_TOTAL_BYTES=2_000_000;
const encoder=new TextEncoder();
// BOM handling is explicit below; never let TextDecoder silently strip an additional U+FEFF.
const decoder=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true});
const bom=new Uint8Array([0xef,0xbb,0xbf]);

export function validateBatchTextSelection(files:readonly {name:string;size:number}[]):void{
  if(files.length<1||files.length>MAX_FILES)throw Error("Select 1–20 local TXT, MD, CSV or TSV files.");
  const seen=new Set<string>();
  let total=0;
  for(const file of files){
    if(!file.name||file.name.length>180||/[\\/\u0000-\u001f\u007f]/u.test(file.name)||file.name==="."||file.name===".."||!EXT.test(file.name))
      throw Error("Only safe .txt, .md, .markdown, .csv and .tsv filenames are supported.");
    const key=file.name.toLocaleLowerCase("en");
    if(seen.has(key))throw Error("Duplicate filenames (ignoring case) must be renamed before selection.");
    seen.add(key);
    if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_FILE_BYTES)
      throw Error("Each input file must contain 1–200,000 bytes.");
    total+=file.size;
  }
  if(total>MAX_TOTAL_BYTES)throw Error("Combined input exceeds 2 MB.");
}

function hasBom(data:Uint8Array):boolean{
  return data.length>=3&&data[0]===bom[0]&&data[1]===bom[1]&&data[2]===bom[2];
}
function occurrences(value:string,regexp:RegExp):number{return Array.from(value.matchAll(regexp)).length;}

/** Preserve each surviving line's original CRLF/LF/CR bytes; never normalize unrelated lines. */
function splitPhysicalLines(source:string):{content:string;ending:string}[]{
  const tokens=source.split(/(\r\n|\r|\n)/u);
  const lines:{content:string;ending:string}[]=[];
  for(let i=0;i<tokens.length;i+=2){
    const content=tokens[i],ending=tokens[i+1]??"";
    // A terminator at EOF is not an additional blank physical line.
    if(content===""&&ending===""&&i===tokens.length-1)continue;
    lines.push({content,ending});
  }
  return lines;
}
function cleanupPhysicalLines(source:string,mode:"trim-trailing"|"remove-blank"|"dedupe-lines"):{text:string;count:number}{
  const rows=splitPhysicalLines(source);
  let count=0;
  const seen=new Set<string>(),out:string[]=[];
  for(const row of rows){
    if(mode==="remove-blank"&&/^[ \t]*$/u.test(row.content)){count++;continue;}
    if(mode==="dedupe-lines"){
      // Exact, case-sensitive matching: this is not a CSV record parser.
      if(seen.has(row.content)){count++;continue;}
      seen.add(row.content);
    }
    let value=row.content;
    if(mode==="trim-trailing"){
      const cleaned=value.replace(/[ \t]+$/u,"");
      if(value!==cleaned)count++;
      value=cleaned;
    }
    out.push(value+row.ending);
  }
  return {text:out.join(""),count};
}


/** Paste rows from a two-column spreadsheet: one literal find<TAB>replace pair per line. */
export function parseLiteralReplacementRules(raw:string):{find:string;replacement:string}[]{
  if(raw.length>20_000)throw Error("Replacement rules exceed 20,000 characters.");
  const lines=raw.split(/\r\n?|\n/u).filter(line=>line.length>0);
  if(!lines.length||lines.length>20)throw Error("Enter 1–20 replacement rules, one TAB-separated pair per line.");
  const seen=new Set<string>();
  return lines.map((line,index)=>{
    const pos=line.indexOf("\t");
    if(pos<1||line.indexOf("\t",pos+1)!==-1)throw Error("Rule "+(index+1)+": use exactly one TAB between find and replace.");
    const find=line.slice(0,pos),replacement=line.slice(pos+1);
    if(!find.trim()||find.length>1000||replacement.length>10000||/[\u0000-\u001f\u007f]/u.test(find+replacement))
      throw Error("Rule "+(index+1)+": invalid or oversized literal text.");
    if(seen.has(find))throw Error("Duplicate find phrase on rule "+(index+1)+".");
    seen.add(find);
    return {find,replacement};
  });
}
function addAffixToLines(source:string,mode:"prefix-lines"|"suffix-lines",affix:string):{text:string;count:number}{
  const rows=splitPhysicalLines(source);
  let count=0;
  const text=rows.map(row=>{
    // Never change blank lines; never alter existing CR, LF or CRLF separators.
    if(!row.content.trim())return row.content+row.ending;
    count++;
    return (mode==="prefix-lines"?affix+row.content:row.content+affix)+row.ending;
  }).join("");
  return {text,count};
}

export function processBatchTextFiles(sources:readonly BatchTextSource[],mode:BatchTextMode,find="",replacement="",ruleText="",affix=""):BatchTextResult[]{
  validateBatchTextSelection(sources.map(x=>({name:x.name,size:x.bytes.length})));
  if(!(["replace","lf","crlf","remove-bom","trim-trailing","remove-blank","dedupe-lines","multi-replace","prefix-lines","suffix-lines"] as string[]).includes(mode))throw Error("Unknown batch text operation.");
  if(mode==="replace"&&(!find||find.length>1000||replacement.length>10000))
    throw Error("Enter a literal search phrase (1–1,000 chars) and up to 10,000 replacement characters.");
  const rules=mode==="multi-replace"?parseLiteralReplacementRules(ruleText):[];
  if((mode==="prefix-lines"||mode==="suffix-lines")&&
    (!affix||affix.length>100||/[\u0000-\u001f\u007f]/u.test(affix)))
    throw Error("Enter a printable line prefix/suffix (1–100 characters, no tabs or newlines).");
  const results:BatchTextResult[]=[];
  for(const file of sources){
    const bytes=file.bytes;
    const containsBom=hasBom(bytes);
    let original:string;
    try {original=decoder.decode(containsBom?bytes.subarray(3):bytes);}
    catch{throw Error(file.name+": invalid UTF-8. This tool does not guess or rewrite legacy encodings.");}
    if(original.includes("\u0000"))throw Error(file.name+": binary/NUL data detected. This tool only handles UTF-8 text.");
    if((mode==="trim-trailing"||mode==="remove-blank"||mode==="dedupe-lines"||mode==="prefix-lines"||mode==="suffix-lines")&&/\.(csv|tsv)$/iu.test(file.name))
      throw Error(file.name+": this line cleanup is for TXT/Markdown only. CSV/TSV can contain quoted multi-line fields; use the CSV table desk instead.");
    let next=original, matches=0;
    let ruleCounts:number[]|undefined;
    if(mode==="replace"){
      ({text:next,count:matches}=replaceTextLiteral(original,find,replacement));
    }else if(mode==="multi-replace"){
      ruleCounts=[];
      for(const rule of rules){
        const result=replaceTextLiteral(next,rule.find,rule.replacement);
        next=result.text;matches+=result.count;ruleCounts.push(result.count);
      }
    }else if(mode==="prefix-lines"||mode==="suffix-lines"){
      ({text:next,count:matches}=addAffixToLines(original,mode,affix));
    }else if(mode==="lf"){
      matches=occurrences(original,/\r\n|\r/gu);
      next=original.replace(/\r\n?|\n/gu,"\n");
    }else if(mode==="crlf"){
      matches=occurrences(original,/\r(?!\n)|(?<!\r)\n/gu);
      next=original.replace(/\r\n?|\n/gu,"\r\n");
    }else if(mode==="remove-bom"){
      matches=containsBom?1:0;
    }else if(mode==="trim-trailing"||mode==="remove-blank"||mode==="dedupe-lines"){
      ({text:next,count:matches}=cleanupPhysicalLines(original,mode));
    }
    const nextBytes=encoder.encode((containsBom&&mode!=="remove-bom"?"\ufeff":"")+next);
    if(nextBytes.length>MAX_FILE_BYTES*2)throw Error(file.name+": transformed file exceeds 400 KB.");
    const changed=bytes.length!==nextBytes.length||bytes.some((b,i)=>b!==nextBytes[i]);
    results.push({
      name:file.name,outputName:"processed/"+file.name,
      matches,changed,ruleCounts,beforeBytes:bytes.length,afterBytes:nextBytes.length,
      preview:next.slice(0,250),bytes:nextBytes,
    });
  }
  return results;
}

export async function zipBatchTextResults(rows:readonly BatchTextResult[],mode:BatchTextMode):Promise<Uint8Array>{
  const changed=rows.filter(row=>row.changed);
  if(!changed.length)throw Error("No changes to save. Originals were not modified.");
  if(changed.length>MAX_FILES)throw Error("Too many output files.");
  const zip=new JSZip();
  for(const row of changed)zip.file(row.outputName,row.bytes);
  const manifest={version:1,operation:mode,files:rows.map(({name,outputName,matches,changed,ruleCounts,beforeBytes,afterBytes})=>({
    original:name,output:changed?outputName:null,matches,changed,ruleCounts,beforeBytes,afterBytes,
  }))};
  zip.file("sentinel-box-batch-text-manifest.json",JSON.stringify(manifest,null,2)+"\n");
  const result=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:3}});
  if(result.length>20_000_000)throw Error("ZIP output exceeds the 20 MB export limit.");
  const check=await JSZip.loadAsync(result,{checkCRC32:true});
  for(const row of changed){
    const found=check.file(row.outputName);
    if(!found)throw Error("ZIP verification failed: missing "+row.name);
    const actual=await found.async("uint8array");
    if(actual.length!==row.bytes.length||actual.some((b,i)=>b!==row.bytes[i]))
      throw Error("ZIP verification failed: altered bytes for "+row.name);
  }
  return result;
}
