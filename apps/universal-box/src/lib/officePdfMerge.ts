import {PDFDocument} from "pdf-lib";
export type PdfMergeSource={name:string;size:number;arrayBuffer:()=>Promise<ArrayBuffer>};
export type PdfMergeItem={name:string;pages:number;sourceBytes:number};
export type PdfMergePlan={files:PdfMergeItem[];totalPages:number;sourceBytes:number};
export async function inspectOfficePdfMerge(files:readonly PdfMergeSource[]):Promise<PdfMergePlan>{
 if(!files.length||files.length>20)throw Error("Choose 1–20 PDF files.");
 const plan:PdfMergeItem[]=[];let totalBytes=0,totalPages=0;
 for(const file of files){
  if(!/\.pdf$/iu.test(file.name)||!Number.isSafeInteger(file.size)||file.size<1||file.size>8_000_000)
   throw Error("Choose real PDF files no larger than 8 MB each.");
  totalBytes+=file.size;
  if(totalBytes>18_000_000)throw Error("Selected PDFs exceed 18 MB total.");
  let document:PDFDocument;
  try{document=await PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:false});}
  catch{throw Error("Cannot read "+file.name+" as an unencrypted PDF.");}
  const pages=document.getPageCount();
  if(pages<1)throw Error("Empty PDF: "+file.name);
  totalPages+=pages;
  if(totalPages>300)throw Error("Combined document exceeds 300 pages.");
  plan.push({name:file.name,pages,sourceBytes:file.size});
 }
 return {files:plan,totalPages,sourceBytes:totalBytes};
}
export async function mergeOfficePdfs(files:readonly PdfMergeSource[]):Promise<{
 bytes:Uint8Array;sourceBytes:number;outputBytes:number;pages:number;
}>{
 const plan=await inspectOfficePdfMerge(files);
 const doc=await PDFDocument.create();
 for(const file of files){
  const source=await PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:false});
  const copied=await doc.copyPages(source,source.getPageIndices());
  for(const page of copied)doc.addPage(page);
 }
 const bytes=new Uint8Array(await doc.save());
 if(bytes.length>20_000_000)throw Error("Merged PDF exceeds the 20 MB output limit.");
 const reread=await PDFDocument.load(bytes,{ignoreEncryption:false});
 if(reread.getPageCount()!==plan.totalPages)throw Error("Merged PDF page count verification failed.");
 return {bytes,sourceBytes:plan.sourceBytes,outputBytes:bytes.length,pages:plan.totalPages};
}
