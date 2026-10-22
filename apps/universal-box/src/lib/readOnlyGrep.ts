/** User-selected, read-only, strict UTF-8 multi-file literal search. No filesystem traversal. */
export const GREP_MAX_FILES=20;
export const GREP_MAX_FILE_BYTES=200_000;
export const GREP_MAX_TOTAL_BYTES=2_000_000;
export const GREP_MAX_LINES=75_000;
export const GREP_MAX_MATCHES=5_000;
export const GREP_MAX_QUERY_CHARS=120;

export type GrepSource={name:string;bytes:number;text:string};
export type GrepMatch={file:string;fileIndex:number;line:number;snippet:string;lineText:string};
export type GrepSummary={name:string;matchedLines:number};
export type GrepReport={
 query:string;caseSensitive:boolean;matches:GrepMatch[];
 files:GrepSummary[];totalLines:number;totalFiles:number;totalBytes:number;
};
const TEXT_EXT=/\.(?:txt|md|markdown|csv|tsv|json|jsonl|ndjson|srt|vtt|log)$/iu;

export function validateGrepFiles(files:readonly GrepSource[]):void{
 if(files.length<1||files.length>GREP_MAX_FILES)
  throw Error("Select 1–20 local text files.");
 let total=0;
 for(const file of files){
  if(!file.name||file.name.length>250||/[\\/\u0000-\u001f\u007f]/u.test(file.name)||
     !TEXT_EXT.test(file.name))
    throw Error("Unsupported text filename: "+file.name.slice(0,60));
  if(!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>GREP_MAX_FILE_BYTES)
    throw Error("Each text file must be 1–200,000 bytes: "+file.name);
  if(typeof file.text!=="string"||file.text.length>GREP_MAX_FILE_BYTES)
    throw Error("Invalid decoded text file: "+file.name);
  total+=file.bytes;
  if(total>GREP_MAX_TOTAL_BYTES)throw Error("Selected files exceed the 2 MB total limit.");
 }
}
export function validateGrepQuery(query:string):string{
 if(typeof query!=="string"||!query||query.trim().length<1||
    query.length>GREP_MAX_QUERY_CHARS||/[\r\n\u0000-\u001f\u007f]/u.test(query))
  throw Error("Enter 1–120 literal characters without line breaks.");
 return query;
}
function rawLines(value:string):string[]{
 const lines=value.replace(/\r\n?/gu,"\n").split("\n");
 if(lines.at(-1)==="")lines.pop();
 return lines;
}
export function runReadOnlyGrep(files:readonly GrepSource[],query:string,caseSensitive=false):GrepReport{
 validateGrepFiles(files);
 const needle=validateGrepQuery(query);
 const matches:GrepMatch[]=[],summaries:GrepSummary[]=[];
 let totalLines=0,totalBytes=0;
 const test=caseSensitive?needle:needle.toLocaleLowerCase();
 for(let fileIndex=0;fileIndex<files.length;fileIndex++){
  const file=files[fileIndex];
  totalBytes+=file.bytes;
  const lines=rawLines(file.text);
  totalLines+=lines.length;
  if(totalLines>GREP_MAX_LINES)throw Error("Too many text lines; limit is 75,000.");
  let matchedLines=0;
  for(let i=0;i<lines.length;i++){
   const line=lines[i],checked=caseSensitive?line:line.toLocaleLowerCase();
   if(!checked.includes(test))continue;
   matchedLines++;
   if(matches.length>=GREP_MAX_MATCHES)
    throw Error("Search has more than 5,000 matching lines. Narrow the query to export the full result.");
   // Keep the unmodified original line in the report, and only a bounded display excerpt.
   const position=checked.indexOf(test);
   const start=Math.max(0,position-70);
   const end=Math.min(line.length,Math.max(position+needle.length+70,start+220));
   const snippet=(start?"…":"")+line.slice(start,end)+(end<line.length?"…":"");
   matches.push({file:file.name,fileIndex,line:i+1,snippet,lineText:line});
  }
  summaries.push({name:file.name,matchedLines});
 }
 return {query:needle,caseSensitive,matches,files:summaries,totalLines,totalFiles:files.length,totalBytes};
}
function csvCell(value:string):string{
 const safe=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/gu,'""')+'"';
}
/** Export every matching line, not merely the first 100 shown in the interface. */
export function exportGrepCsv(report:GrepReport):string{
 if(report.matches.length>GREP_MAX_MATCHES)throw Error("Search output exceeds the export limit.");
 const rows=report.matches.map(item=>[
  String(item.fileIndex+1),csvCell(item.file),String(item.line),
  csvCell(item.snippet),csvCell(item.lineText),
 ].join(","));
 return "\uFEFFfile_index,file_name,line_number,preview,original_line\r\n"+
  rows.join("\r\n")+(rows.length?"\r\n":"");
}
