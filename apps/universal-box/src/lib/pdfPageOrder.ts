/** One-based PDF page sequence for non-destructive reorder / remove operations. */
export function parsePdfOrder(text:string, count:number):number[]{
  if(!Number.isSafeInteger(count)||count<1||count>3000)throw new Error("Unsupported PDF page count.");
  const results:number[]=[];
  const used=new Set<number>();
  for(const item of text.split(",")){
    const part=item.trim();
    if(!part)continue;
    const range=/^(\d+)(?:-(\d+))?$/u.exec(part);
    if(!range)throw new Error("Use a sequence like 3,1,2,5-8. Every page can appear once.");
    const a=Number(range[1]),b=range[2]?Number(range[2]):a;
    if(a<1||b>count||a>b)throw new Error("Page out of bounds or invalid range.");
    for(let n=a;n<=b;n++){
      if(used.has(n))throw new Error("Page "+n+" appears more than once.");
      used.add(n);results.push(n-1);
    }
  }
  if(!results.length)throw new Error("Keep at least one page.");
  return results;
}

/** Preview mapping before saving an office PDF reorder / page removal. */
export type PdfPageOrderPlan={
 originalCount:number;outputCount:number;removedCount:number;
 order:number[];
 mapping:{outputPage:number;sourcePage:number}[];
};
export function previewPdfOrder(expression:string,count:number):PdfPageOrderPlan{
 if(count>300)throw Error("Reorder up to 300 PDF pages at a time.");
 const order=parsePdfOrder(expression,count);
 return {originalCount:count,outputCount:order.length,removedCount:count-order.length,
  order,mapping:order.map((from,i)=>({outputPage:i+1,sourcePage:from+1}))};
}

/** Build genuine reordered PDF pages and independently reopen output to verify geometry and sequence. */
export async function exportReorderedPdf(source:import("pdf-lib").PDFDocument,expression:string):
 Promise<{bytes:Uint8Array;plan:PdfPageOrderPlan}>{
 const {PDFDocument}=await import("pdf-lib");
 const plan=previewPdfOrder(expression,source.getPageCount());
 if(plan.originalCount>300)throw Error("Reorder up to 300 PDF pages at a time.");
 const result=await PDFDocument.create();
 const pages=await result.copyPages(source,plan.order);
 pages.forEach(page=>result.addPage(page));
 const bytes=new Uint8Array(await result.save());
 if(bytes.length>20_000_000)throw Error("Reordered PDF exceeds the 20 MB output limit.");
 const verify=await PDFDocument.load(bytes,{ignoreEncryption:false});
 if(verify.getPageCount()!==plan.outputCount)throw Error("Reordered PDF page count mismatch.");
 for(const {outputPage,sourcePage} of plan.mapping){
  const original=source.getPage(sourcePage-1),written=verify.getPage(outputPage-1);
  const a=original.getMediaBox(),b=written.getMediaBox();
  const c=original.getCropBox(),d=written.getCropBox();
  const same=(x:number,y:number)=>Math.abs(x-y)<0.01;
  if(!same(a.x,b.x)||!same(a.y,b.y)||!same(a.width,b.width)||!same(a.height,b.height)||
     !same(c.x,d.x)||!same(c.y,d.y)||!same(c.width,d.width)||!same(c.height,d.height)||
     original.getRotation().angle!==written.getRotation().angle)
    throw Error("Reordered PDF page geometry verification failed on page "+outputPage+".");
 }
 return {bytes,plan};
}
