import {PDFDocument} from "pdf-lib";
export type PdfMergeSource={name:string;size:number;arrayBuffer:()=>Promise<ArrayBuffer>};
export type PdfMergeItem={name:string;pages:number;sourceBytes:number};
export type PdfMergePlan={files:PdfMergeItem[];totalPages:number;sourceBytes:number};
/** Stable adjacent move for previewed PDF input order; never alters File objects. */
export function movePdfMergeSource<T>(items:readonly T[],index:number,direction:-1|1):T[]{
 if(!Number.isSafeInteger(index)||index<0||index>=items.length||Math.abs(direction)!==1)
  throw Error("Invalid PDF merge list movement.");
 const target=index+direction;
 const reordered=[...items];
 if(target<0||target>=items.length)return reordered;
 [reordered[index],reordered[target]]=[reordered[target],reordered[index]];
 return reordered;
}
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
 const expected:{width:number;height:number;rotation:number;crop:{x:number;y:number;width:number;height:number}}[]=[];
 for(const file of files){
  const source=await PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:false});
  for(const page of source.getPages()){
   const crop=page.getCropBox();
   expected.push({width:page.getWidth(),height:page.getHeight(),
    rotation:page.getRotation().angle,crop});
  }
  const copied=await doc.copyPages(source,source.getPageIndices());
  for(const page of copied)doc.addPage(page);
 }
 const bytes=new Uint8Array(await doc.save());
 if(bytes.length>20_000_000)throw Error("Merged PDF exceeds the 20 MB output limit.");
 const reread=await PDFDocument.load(bytes,{ignoreEncryption:false});
 if(reread.getPageCount()!==plan.totalPages)throw Error("Merged PDF page count verification failed.");
 // Verify page geometry and rotation in the *requested source-file order*, not only page totals.
 for(let i=0;i<expected.length;i++){
  const original=expected[i],page=reread.getPage(i),crop=page.getCropBox();
  const eq=(a:number,b:number)=>Math.abs(a-b)<0.01;
  if(!eq(original.width,page.getWidth())||!eq(original.height,page.getHeight())||
    original.rotation!==page.getRotation().angle||
    !eq(original.crop.x,crop.x)||!eq(original.crop.y,crop.y)||
    !eq(original.crop.width,crop.width)||!eq(original.crop.height,crop.height))
   throw Error("Merged PDF page order or geometry verification failed at output page "+(i+1)+".");
 }
 return {bytes,sourceBytes:plan.sourceBytes,outputBytes:bytes.length,pages:plan.totalPages};
}
