/** Offline scanned-PDF image recompression. Preserves visible page images, not selectable text or
 * vector/annotation semantics; deliberately refuses any detected text layer and annotations.
 * Rendering and JPEG encoding happen locally and only after explicit user selection/click.
 */
import {getDocument,GlobalWorkerOptions} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {PDFDocument} from "pdf-lib";

GlobalWorkerOptions.workerSrc=pdfWorker;
export type ScanPdfPreset="small"|"balanced"|"quality";
export type ScanPdfOptions={preset:ScanPdfPreset};
export type ScanPdfProgress={done:number;total:number};
export type ScannedPdfReport={
 originalBytes:number;candidateBytes:number;pages:number;beforePixelCount:number;
 savedBytes:number;savedPercent:number;improved:boolean;output:Uint8Array|null;
 dpi:number;jpegQuality:number;pagePixels:{page:number;width:number;height:number}[];
};
export const SCAN_PRESETS={
 small:{dpi:96,jpegQuality:.48,label:"Smaller file · 96 DPI / JPEG 48%"},
 balanced:{dpi:120,jpegQuality:.65,label:"Balanced · 120 DPI / JPEG 65%"},
 quality:{dpi:150,jpegQuality:.82,label:"Sharper · 150 DPI / JPEG 82%"},
} as const;
const MAX_BYTES=15_000_000,MAX_PAGES=12,MAX_PIXELS_PER_PAGE=3_500_000,MAX_OUTPUT=20_000_000;
export function planScanRaster(width:number,height:number,dpi:number):{width:number;height:number;scale:number}{
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<20||height<20||width>3000||height>3000)
  throw Error("PDF page dimensions are outside 20–3,000 pt.");
 if(![96,120,150].includes(dpi))throw Error("Select an available scan quality preset.");
 const rasterScale=Math.min(dpi/72,Math.sqrt(MAX_PIXELS_PER_PAGE/(width*height)));
 const w=Math.max(1,Math.floor(width*rasterScale));
 const h=Math.max(1,Math.floor(height*rasterScale));
 if(w*h>MAX_PIXELS_PER_PAGE)throw Error("Raster page exceeds pixel budget.");
 return {width:w,height:h,scale:rasterScale};
}
function jpgFromCanvas(canvas:HTMLCanvasElement,quality:number):Promise<Uint8Array>{
 return new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>{
   if(!blob||blob.type!=="image/jpeg"){reject(Error("JPEG canvas encoding is unavailable in this macOS WebView."));return;}
   void blob.arrayBuffer().then(value=>resolve(new Uint8Array(value)),reject);
  },"image/jpeg",quality);
 });
}
export async function recompressScannedPdf(
 input:Uint8Array,options:ScanPdfOptions,onProgress?:(p:ScanPdfProgress)=>void,signal?:AbortSignal,
):Promise<ScannedPdfReport>{
 const checkCancelled=()=>{if(signal?.aborted)throw Error("Scan compression cancelled. Nothing was saved.");};
 checkCancelled();
 if(input.length<100||input.length>MAX_BYTES)throw Error("Select a scanned PDF from 100 bytes to 15 MB.");
 const preset=SCAN_PRESETS[options.preset];
 if(!preset)throw Error("Select an available JPEG / DPI compression preset.");
 if(typeof document==="undefined")throw Error("Local browser canvas is required to recompress pages.");
 const signatureText=new TextDecoder("latin1").decode(input);
 if(/\/ByteRange\s*\[/u.test(signatureText)||/\/Type\s*\/Sig(?:\s|[/>])/u.test(signatureText))
  throw Error("Signed PDF cannot be flattened; choose an unsigned scanned document.");
 const source=await PDFDocument.load(input,{updateMetadata:false});
 checkCancelled();
 if(source.getPageCount()<1||source.getPageCount()>MAX_PAGES)
  throw Error("Scanned PDF compressor supports only 1–12 pages.");
 if(source.getForm().getFields().length)
  throw Error("This PDF contains forms. Raster compression would remove them, so conversion is blocked.");

 // Clone: pdf.js worker may transfer its input buffer. Keep original intact for comparison.
 const loading=getDocument({data:new Uint8Array(input),useSystemFonts:false});
 let pdf:Awaited<typeof loading.promise>|null=null;
 try{
  pdf=await loading.promise;
  checkCancelled();
  if(pdf.numPages!==source.getPageCount())throw Error("PDF readers disagree on document page count.");
  const attachments=await pdf.getAttachments();
  if(attachments&&Object.keys(attachments).length)throw Error("PDF attachments would be lost; conversion blocked.");
  const outline=await pdf.getOutline();
  if(outline?.length)throw Error("PDF bookmarks/outline would be lost; conversion blocked.");

  // Preflight every page BEFORE rendering any output. This prevents silently flattening text layers,
  // links, annotations or forms even if those are present on later pages.
  const pages=[] as {index:number;width:number;height:number}[];
  for(let i=1;i<=pdf.numPages;i++){
   checkCancelled();
   const page=await pdf.getPage(i);
   const text=await page.getTextContent();
   if(text.items.some(item=>("str" in item)&&typeof item.str==="string"&&item.str.trim()))
    throw Error("Page "+i+" contains selectable/OCR text. To preserve it, scanned-only recompression is blocked.");
   checkCancelled();
   const annotations=await page.getAnnotations({intent:"display"});
   if(annotations.length)throw Error("Page "+i+" has interactive annotations or links. Flattening is blocked.");
   const viewport=page.getViewport({scale:1});
   planScanRaster(viewport.width,viewport.height,preset.dpi);
   pages.push({index:i,width:viewport.width,height:viewport.height});
   page.cleanup();
  }
  const result=await PDFDocument.create(),pagePixels:ScannedPdfReport["pagePixels"]=[];
  let totalPixels=0;
  for(const p of pages){
   checkCancelled();
   const page=await pdf.getPage(p.index);
   const dims=planScanRaster(p.width,p.height,preset.dpi);
   const viewport=page.getViewport({scale:dims.scale});
   const canvas=document.createElement("canvas");
   canvas.width=dims.width;canvas.height=dims.height;
   const context=canvas.getContext("2d",{alpha:false});
   if(!context)throw Error("Canvas 2D is unavailable.");
   context.fillStyle="#ffffff";
   context.fillRect(0,0,canvas.width,canvas.height);
   const task=page.render({canvasContext:context,viewport});
   const cancelRender=()=>task.cancel();
   signal?.addEventListener("abort",cancelRender,{once:true});
   if(signal?.aborted)task.cancel();
   try{
    checkCancelled();
    try{await task.promise;}catch(e){checkCancelled();throw e;}
    checkCancelled();
    const jpeg=await jpgFromCanvas(canvas,preset.jpegQuality);
    checkCancelled();
    if(jpeg.length>12_000_000)throw Error("One recompressed page exceeds 12 MB.");
    const embedded=await result.embedJpg(jpeg);
    const newPage=result.addPage([p.width,p.height]);
    newPage.drawImage(embedded,{x:0,y:0,width:p.width,height:p.height});
    pagePixels.push({page:p.index,width:canvas.width,height:canvas.height});
    totalPixels+=canvas.width*canvas.height;
    onProgress?.({done:p.index,total:pages.length});
   }finally{
    signal?.removeEventListener("abort",cancelRender);
    canvas.width=0;canvas.height=0;
    page.cleanup();
   }
  }
  checkCancelled();
  const bytes=await result.save({useObjectStreams:true});
  checkCancelled();
  if(bytes.length>MAX_OUTPUT)throw Error("Compressed PDF exceeds 20 MB.");
  const verified=await PDFDocument.load(bytes,{updateMetadata:false});
  if(verified.getPageCount()!==pages.length)throw Error("Output PDF page-count verification failed.");
  if(verified.getPages().some((p,i)=>Math.abs(p.getWidth()-pages[i].width)>.05||Math.abs(p.getHeight()-pages[i].height)>.05))
   throw Error("Output PDF page-size verification failed.");
  checkCancelled();
  const improved=bytes.length<input.length;
  return {originalBytes:input.length,candidateBytes:bytes.length,pages:pages.length,
   beforePixelCount:totalPixels,savedBytes:improved?input.length-bytes.length:0,
   savedPercent:improved?Number(((input.length-bytes.length)*100/input.length).toFixed(2)):0,
   improved,output:improved?bytes:null,dpi:preset.dpi,jpegQuality:preset.jpegQuality,pagePixels};
 }finally{
  if(pdf)await pdf.destroy().catch(()=>{});
  else await loading.destroy().catch(()=>{});
 }
}
