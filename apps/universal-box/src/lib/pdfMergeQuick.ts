/** Local, bounded PDF merge helpers. Never upload or modify input files. */
import {PDFDocument} from "pdf-lib";

export const PDF_MERGE_MAX_FILES=20;
export const PDF_MERGE_MAX_INPUT_BYTES=15_000_000;
export const PDF_MERGE_MAX_TOTAL_BYTES=60_000_000;
export const PDF_MERGE_MAX_OUTPUT_BYTES=20_000_000;
export type MergePdfInput=Pick<File,"name"|"size"|"arrayBuffer">;
export type MergePdfEntry={name:string;bytes:number;pages:number};

export function moveMergeFile<T>(items:readonly T[],from:number,to:number):T[]{
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
     from<0||to<0||from>=items.length||to>=items.length)
     throw Error("Selected PDF order is invalid.");
  const copy=[...items],item=copy.splice(from,1)[0];
  copy.splice(to,0,item);
  return copy;
}
export function validateMergeFiles(files:readonly Pick<MergePdfInput,"name"|"size">[]):number{
  if(files.length<1||files.length>PDF_MERGE_MAX_FILES)
    throw Error("Choose 1–20 PDFs.");
  let total=0;
  for(const file of files){
    if(!/\.pdf$/iu.test(file.name)||!Number.isSafeInteger(file.size)||
       file.size<100||file.size>PDF_MERGE_MAX_INPUT_BYTES)
      throw Error("Each PDF must be a valid .pdf file from 100 bytes to 15 MB.");
    total+=file.size;
  }
  if(total>PDF_MERGE_MAX_TOTAL_BYTES)throw Error("Selected PDFs exceed the 60 MB input limit.");
  return total;
}
export async function inspectMergeFiles(files:readonly MergePdfInput[]):Promise<MergePdfEntry[]>{
  validateMergeFiles(files);
  const entries:MergePdfEntry[]=[];
  for(let i=0;i<files.length;i++){
    const file=files[i];
    try{
      const document=await PDFDocument.load(await file.arrayBuffer());
      const pages=document.getPageCount();
      if(!pages||pages>200)throw Error("PDF must contain 1–200 pages");
      entries.push({name:file.name,bytes:file.size,pages});
    }catch(e){
      throw Error("PDF "+(i+1)+" ("+file.name+") could not be read: "+String(e instanceof Error?e.message:e));
    }
  }
  return entries;
}
/** Produces the actual output PDF in the user-visible order. */
export async function mergePdfFiles(files:readonly MergePdfInput[]):Promise<{bytes:Uint8Array;pages:number}>{
  validateMergeFiles(files);
  const output=await PDFDocument.create();
  let count=0;
  for(let index=0;index<files.length;index++){
    let source:PDFDocument;
    try{source=await PDFDocument.load(await files[index].arrayBuffer());}
    catch(e){throw Error("Could not read PDF "+(index+1)+": "+String(e instanceof Error?e.message:e));}
    const n=source.getPageCount();
    if(!n||n>200)throw Error("Each input PDF must contain 1–200 pages.");
    count+=n;
    if(count>400)throw Error("Merged output exceeds 400 pages.");
    const copied=await output.copyPages(source,source.getPageIndices());
    for(const page of copied)output.addPage(page);
  }
  const bytes=await output.save();
  if(bytes.length>PDF_MERGE_MAX_OUTPUT_BYTES)throw Error("Merged PDF exceeds 20 MB export limit.");
  return {bytes,pages:count};
}

/** Page boundaries let users verify the final placement before processing. */
export function mergedPageRanges(entries:readonly MergePdfEntry[]):{first:number;last:number}[]{
 if(entries.length>PDF_MERGE_MAX_FILES)throw Error("Too many PDFs for a merge.");
 let current=1;
 return entries.map(entry=>{
  if(!Number.isSafeInteger(entry.pages)||entry.pages<1||entry.pages>200)
   throw Error("Invalid source PDF page count.");
  const first=current,last=first+entry.pages-1;
  if(last>400)throw Error("Merged PDF exceeds 400 pages.");
  current=last+1;
  return {first,last};
 });
}

/** Keep the user-selected name local and ensure we never export a path or another extension. */
export function validateMergeOutputName(value:string):string{
 const name=value.trim();
 if(!name||name.length>100||/[\\/:*?"<>|\u0000-\u001f\u007f]/u.test(name))
  throw Error("Use a short filename without slashes, reserved symbols or control characters.");
 const stem=name.replace(/\.pdf$/iu,"");
 if(!stem||stem.length>95||stem.startsWith(".")||stem.endsWith(".")||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(stem))
  throw Error("Please choose a valid PDF filename (not a reserved system name).");
 return stem+".pdf";
}
