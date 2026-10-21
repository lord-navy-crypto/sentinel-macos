/** Three bounded, offline user-selected review and repair operations. */
import JSZip from "jszip";
import {inspectOffice} from "./officeInspector";
import {inspectPcmWav,editPcmWav} from "./wavTools";
import {inspectPdfEveryday} from "./pdfEveryday";

export type ReviewInput={name:string;bytes:Uint8Array};
export type WordChange={kind:"same"|"removed"|"added";line:string};
export type WordReview={changes:WordChange[];same:number;added:number;removed:number;left:number;right:number};
export type WavSilenceReview={startMs:number;endMs:number;durationMs:number;removedStartMs:number;removedEndMs:number;thresholdDb:number;output:Uint8Array};
export type PdfAuditItem={name:string;pages:number;portrait:number;landscape:number;other:number;sizes:string[];title:string;author:string};
export type PdfAuditResult={files:PdfAuditItem[];totalPages:number;reportCsv:string};
const nameOK=(n:string)=>!!n&&n.length<=255&&!/[\u0000-\u001f\u007f]/u.test(n);
const bytesOk=(item:ReviewInput,extension:string,max:number)=>{
 if(!nameOK(item.name)||!item.name.toLowerCase().endsWith("."+extension)||item.bytes.length<1||item.bytes.length>max)
  throw Error("Choose a valid ."+extension+" file with a supported size.");
};
const quote=(cell:string|number)=>{
 let value=String(cell);
 if(/^\s*[=+\-@\t\r]/u.test(value))value="'"+value;
 return '"'+value.replace(/"/gu,'""')+'"';
};
export async function compareWordDocuments(a:ReviewInput,b:ReviewInput):Promise<WordReview>{
 bytesOk(a,"docx",8_000_000);bytesOk(b,"docx",8_000_000);
 const [first,second]=await Promise.all([inspectOffice(a.name,a.bytes),inspectOffice(b.name,b.bytes)]);
 const left=first.sections.map(p=>p.text),right=second.sections.map(p=>p.text);
 if(left.length>300||right.length>300)throw Error("Review supports at most 300 nonempty paragraphs per Word document.");
 // A stable paragraph LCS shows insertions/deletions. Changed paragraphs appear as a remove+add.
 const n=left.length,m=right.length;
 const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
  dp[i][j]=left[i]===right[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const changes:WordChange[]=[];let i=0,j=0,same=0,added=0,removed=0;
 while(i<n||j<m){
  if(i<n&&j<m&&left[i]===right[j]){changes.push({kind:"same",line:left[i]});same++;i++;j++;}
  else if(j<m&&(i===n||dp[i][j+1]>dp[i+1][j])){changes.push({kind:"added",line:right[j++]});added++;}
  else if(i<n){changes.push({kind:"removed",line:left[i++]});removed++;}
  else{changes.push({kind:"added",line:right[j++]});added++;}
 }
 return {changes,same,added,removed,left:n,right:m};
}
export async function wordReviewZip(a:ReviewInput,b:ReviewInput):Promise<Uint8Array>{
 const review=await compareWordDocuments(a,b),zip=new JSZip();
 zip.file("reports/word-paragraph-diff.txt",review.changes.map(x=>(x.kind==="added"?"+ ":x.kind==="removed"?"- ":"  ")+x.line).join("\n")+"\n");
 zip.file("reports/word-paragraph-diff.json",JSON.stringify({
  generator:"Sentinel Box",mode:"paragraph-level Word text comparison",a:a.name,b:b.name,
  ...review,limitations:"Text only. Does not compare formatting, tables, images, comments, revision history or tracked changes."
 },null,2));
 zip.file("reports/README.txt","Read-only DOCX text comparison: added/removed paragraphs are not Word Track Changes. No original files are included.\n");
 return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
export function trimWavSilence(input:Uint8Array,thresholdDb=-42,paddingMs=80):WavSilenceReview{
 if(!Number.isFinite(thresholdDb)||thresholdDb< -75||thresholdDb> -15)throw Error("Silence threshold must be −75 to −15 dBFS.");
 if(!Number.isSafeInteger(paddingMs)||paddingMs<0||paddingMs>750)throw Error("Padding must be 0–750 ms.");
 const info=inspectPcmWav(input),view=new DataView(input.buffer,input.byteOffset,input.byteLength);
 const threshold=32768*Math.pow(10,thresholdDb/20);
 // Inspect absolute samples across all channels; reject all-silent material rather than generating an empty file.
 let first=-1,last=-1;
 for(let frame=0;frame<info.frames;frame++){
  let audible=false;
  for(let channel=0;channel<info.channels;channel++){
   if(Math.abs(view.getInt16(info.dataOffset+(frame*info.channels+channel)*2,true))>=threshold){audible=true;break;}
  }
  if(audible){if(first===-1)first=frame;last=frame;}
 }
 if(first===-1)throw Error("Entire WAV is below the chosen threshold. Nothing was trimmed.");
 const padding=Math.round(paddingMs*info.sampleRate/1000);
 const startFrame=Math.max(0,first-padding),endFrame=Math.min(info.frames,last+1+padding);
 const startMs=startFrame*1000/info.sampleRate,endMs=endFrame*1000/info.sampleRate;
 const edited=editPcmWav(input,{startMs,endMs,normalize:false,fadeMs:0});
 return {startMs,endMs,durationMs:info.durationMs,
  removedStartMs:startMs,removedEndMs:info.durationMs-endMs,
  thresholdDb,output:edited.bytes};
}
export async function wavSilenceZip(input:ReviewInput,thresholdDb=-42,paddingMs=80):Promise<Uint8Array>{
 bytesOk(input,"wav",20_000_000);
 const info=trimWavSilence(input.bytes,thresholdDb,paddingMs),zip=new JSZip();
 zip.file("audio/trimmed.wav",info.output);
 zip.file("reports/silence.json",JSON.stringify({generator:"Sentinel Box",name:input.name,
  thresholdDb:info.thresholdDb,startMs:info.startMs,endMs:info.endMs,durationMs:info.durationMs,
  removedStartMs:info.removedStartMs,removedEndMs:info.removedEndMs,
  method:"16-bit PCM, audible when either channel crosses amplitude threshold; silence-only audio rejected.",
 },null,2));
 zip.file("reports/README.txt","A new WAV copy was created; original audio is never modified. This is threshold trimming, not speech detection or noise reduction.\n");
 return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
export async function auditPdfDocuments(input:readonly ReviewInput[]):Promise<PdfAuditResult>{
 if(input.length<1||input.length>12)throw Error("Choose 1–12 PDFs.");
 let size=0,totalPages=0;const files:PdfAuditItem[]=[];
 for(const item of input){
  bytesOk(item,"pdf",15_000_000);size+=item.bytes.length;
  if(size>30_000_000)throw Error("Selected PDF files exceed 30 MB total.");
  const result=await inspectPdfEveryday(item.bytes);
  totalPages+=result.pages;if(totalPages>700)throw Error("Combined PDF audit exceeds 700 pages.");
  let portrait=0,landscape=0,other=0;const sizes:string[]=[];
  for(const page of result.dimensions){
   const w=Math.round(page.width),h=Math.round(page.height);
   if(w===h)other++;else if(w<h)portrait++;else landscape++;
   sizes.push(w+"x"+h+"pt");
  }
  files.push({name:item.name,pages:result.pages,portrait,landscape,other,
   sizes:[...new Set(sizes)],title:result.title,author:result.author});
 }
 const rows=[["File","Pages","Portrait","Landscape","Square","Sizes","Title","Author"],
  ...files.map(f=>[f.name,f.pages,f.portrait,f.landscape,f.other,f.sizes.join(" ; "),f.title,f.author])];
 return {files,totalPages,reportCsv:"\uFEFF"+rows.map(row=>row.map(quote).join(",")).join("\r\n")+"\r\n"};
}
export async function pdfAuditZip(files:readonly ReviewInput[]):Promise<Uint8Array>{
 const result=await auditPdfDocuments(files),zip=new JSZip();
 zip.file("reports/pdf-page-audit.csv",result.reportCsv);
 zip.file("reports/pdf-page-audit.json",JSON.stringify({
  generator:"Sentinel Box",mode:"PDF metadata and page geometry batch audit",
  totalPages:result.totalPages,files:result.files,
  limitations:"Page sizes based on CropBox. Does not perform OCR, tagged-PDF assessment, redaction, or signature verification."
 },null,2));
 zip.file("reports/README.txt","PDF inspection only: no PDFs were modified. Metadata may contain author names. Review before sharing.\n");
 return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
