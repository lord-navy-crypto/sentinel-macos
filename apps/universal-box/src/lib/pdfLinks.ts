/**
 * Offline PDF external-link annotation editor.
 * Changes only URI /Link annotations; never rewrites visible text, internal
 * page destinations, arbitrary actions, signatures or form widgets.
 */
import {
 PDFArray,PDFDict,PDFDocument,PDFHexString,PDFName,PDFNumber,PDFString,
} from "pdf-lib";

const MAX_INPUT=15_000_000;
const MAX_PAGES=200;
const MAX_ANNOTATIONS_PER_PAGE=1000;
const MAX_LINKS=1000;
const name=(value:string)=>PDFName.of(value);
export type PdfExternalLink={
 page:number;annotationIndex:number;url:string;
 rect:{x:number;y:number;width:number;height:number};
 permitted:boolean;
};
export type PdfLinkBox={page:number;x:number;y:number;width:number;height:number;url:string};
export type PdfLinkOperation={action:"replace"|"remove";page:number;annotationIndex:number;url?:string};

async function openPdf(bytes:Uint8Array):Promise<PDFDocument>{
 if(bytes.length<100||bytes.length>MAX_INPUT)throw Error("Choose a PDF no larger than 15 MB.");
 const doc=await PDFDocument.load(bytes,{updateMetadata:false});
 if(doc.getPageCount()<1||doc.getPageCount()>MAX_PAGES)throw Error("PDF must have 1–200 pages.");
 return doc;
}

/** The UI never opens external links; this validator applies only to *new* destinations. */
export function normalizePdfLinkUrl(value:string):string{
 const text=value.trim();
 if(text.length===0||text.length>2048||/[\u0000-\u0020\u007f]/u.test(text))
  throw Error("Enter a URL under 2,048 characters without spaces/control characters.");
 let parsed:URL;
 try{parsed=new URL(text);}catch{throw Error("Enter a complete https:// or http:// URL.");}
 if(!["https:","http:"].includes(parsed.protocol)||!parsed.hostname)
  throw Error("Only normal HTTPS or HTTP links are supported; file:, javascript:, and other actions are rejected.");
 if(parsed.username||parsed.password)throw Error("Links containing usernames/passwords are not supported.");
 return parsed.href;
}

function readRect(entry:PDFDict):PdfExternalLink["rect"]|null{
 const rect=entry.lookup(name("Rect"));
 if(!(rect instanceof PDFArray)||rect.size()!==4)return null;
 const numbers=Array.from({length:4},(_,i)=>rect.lookup(i));
 if(numbers.some(n=>!(n instanceof PDFNumber)))return null;
 const [left,bottom,right,top]=numbers.map(n=>(n as PDFNumber).asNumber());
 if(![left,bottom,right,top].every(Number.isFinite)||right<left||top<bottom)return null;
 return {x:left,y:bottom,width:right-left,height:top-bottom};
}
function readUri(entry:PDFDict):string|null{
 const subtype=entry.lookup(name("Subtype"));
 if(!(subtype instanceof PDFName)||subtype.toString()!=="/Link")return null;
 const action=entry.lookup(name("A"));
 if(!(action instanceof PDFDict))return null;
 const actionKind=action.lookup(name("S"));
 if(!(actionKind instanceof PDFName)||actionKind.toString()!=="/URI")return null;
 const raw=action.lookup(name("URI"));
 if(!(raw instanceof PDFString||raw instanceof PDFHexString))return null;
 return raw.decodeText();
}
function getUriAnnotation(doc:PDFDocument,pageNum:number,index:number):{annotation:PDFDict;annots:PDFArray}{
 if(!Number.isSafeInteger(pageNum)||pageNum<1||pageNum>doc.getPageCount())
  throw Error("PDF page number is out of range.");
 const annots=doc.getPage(pageNum-1).node.Annots();
 if(!annots||!Number.isSafeInteger(index)||index<0||index>=annots.size())
  throw Error("The selected PDF link was not found.");
 const annotation=annots.lookup(index);
 if(!(annotation instanceof PDFDict)||readUri(annotation)===null)
  throw Error("This annotation is not an external URI link.");
 return {annotation,annots};
}

export async function inspectPdfExternalLinks(bytes:Uint8Array):Promise<PdfExternalLink[]>{
 const doc=await openPdf(bytes);
 const output:PdfExternalLink[]=[];
 for(const [pageIndex,page] of doc.getPages().entries()){
  const annots=page.node.Annots();
  if(!annots)continue;
  if(annots.size()>MAX_ANNOTATIONS_PER_PAGE)throw Error("Page has too many annotations to inspect safely.");
  for(let i=0;i<annots.size();i++){
   const entry=annots.lookup(i);
   if(!(entry instanceof PDFDict))continue;
   const url=readUri(entry);
   if(url===null)continue;
   const rect=readRect(entry);
   if(!rect)continue;
   let permitted=true;
   try{normalizePdfLinkUrl(url);}catch{permitted=false;}
   output.push({page:pageIndex+1,annotationIndex:i,url,rect,permitted});
   if(output.length>MAX_LINKS)throw Error("PDF has more than 1,000 external links.");
  }
 }
 return output;
}

export async function editPdfExternalLink(bytes:Uint8Array,change:PdfLinkOperation):Promise<Uint8Array>{
 const doc=await openPdf(bytes);
 const {annotation,annots}=getUriAnnotation(doc,change.page,change.annotationIndex);
 if(change.action==="replace"){
  const destination=normalizePdfLinkUrl(change.url??"");
  const previous=annotation.lookup(name("A"));
  if(!(previous instanceof PDFDict))throw Error("External URI action is unavailable.");
  // Replace the action dictionary rather than mutating a potentially shared
  // indirect action, leaving other links untouched.
  const next=doc.context.obj({Type:"Action",S:"URI",URI:PDFString.of(destination)});
  annotation.set(name("A"),next);
 }else if(change.action==="remove"){
  annots.remove(change.annotationIndex);
 }else{
  throw Error("Unsupported PDF link operation.");
 }
 return doc.save({updateFieldAppearances:false});
}

export function validatePdfLinkBox(box:PdfLinkBox,pageWidth:number,pageHeight:number):void{
 if(![box.page,box.x,box.y,box.width,box.height,pageWidth,pageHeight].every(Number.isFinite)
  ||!Number.isSafeInteger(box.page)||box.page<1
  ||box.x<0||box.y<0||box.width<4||box.height<4
  ||box.x+box.width>pageWidth+0.001||box.y+box.height>pageHeight+0.001)
  throw Error("Link rectangle is outside the selected page or smaller than 4 PDF points.");
 normalizePdfLinkUrl(box.url);
}
export async function addPdfExternalLink(bytes:Uint8Array,box:PdfLinkBox):Promise<Uint8Array>{
 const doc=await openPdf(bytes);
 if(!Number.isSafeInteger(box.page)||box.page<1||box.page>doc.getPageCount())
  throw Error("Choose a PDF page between 1 and "+doc.getPageCount()+".");
 const page=doc.getPage(box.page-1),crop=page.getCropBox();
 validatePdfLinkBox(box,crop.width,crop.height);
 const existing=page.node.Annots();
 if(existing&&existing.size()>=MAX_ANNOTATIONS_PER_PAGE)
  throw Error("This page already has too many annotations.");
 const uri=normalizePdfLinkUrl(box.url);
 // Coordinates are relative to the page's visible CropBox, whose lower-left
 // origin may be nonzero. The link hotspot is intentionally invisible.
 const x=crop.x+box.x,y=crop.y+box.y;
 const item=doc.context.obj({
  Type:"Annot",Subtype:"Link",
  Rect:[x,y,x+box.width,y+box.height],Border:[0,0,0],
  A:{Type:"Action",S:"URI",URI:PDFString.of(uri)},
 });
 page.node.addAnnot(doc.context.register(item));
 return doc.save({updateFieldAppearances:false});
}


/** Exact-match batch editing across explicitly chosen pages. The preview count
 * is derived from the same predicate used by the write operation.
 */
export type PdfBatchLinkEdit={
 action:"replace"|"remove";
 sourceUrl:string;
 targetUrl?:string;
 pages:"all"|number[];
};
export function parseBatchPdfPages(expression:string,total:number):"all"|number[]{
 if(!Number.isSafeInteger(total)||total<1||total>MAX_PAGES)
  throw Error("PDF must have between 1 and 200 pages.");
 const value=expression.trim();
 if(value.toLowerCase()==="all")return "all";
 if(!/^\d+(?:\s*,\s*\d+)*$/u.test(value)||value.length>500)
  throw Error("Use all or a comma-separated list such as 1,3,5.");
 const pages=[...new Set(value.split(",").map(x=>Number(x.trim())))];
 if(pages.some(x=>!Number.isSafeInteger(x)||x<1||x>total))
  throw Error("One or more selected pages are outside the PDF.");
 return pages.sort((a,b)=>a-b);
}
function matchingPdfLinks(links:PdfExternalLink[],options:PdfBatchLinkEdit):PdfExternalLink[]{
 if(options.sourceUrl.length===0||options.sourceUrl.length>2048)
  throw Error("Choose an exact existing URL (up to 2,048 characters).");
 if(options.pages!=="all"&&(!Array.isArray(options.pages)||options.pages.length>MAX_PAGES
  ||options.pages.some(page=>!Number.isSafeInteger(page)||page<1||page>MAX_PAGES)))
  throw Error("Selected page filter is invalid.");
 if(options.action==="replace")normalizePdfLinkUrl(options.targetUrl??"");
 else if(options.action!=="remove")throw Error("Unknown batch link operation.");
 return links.filter(x=>x.url===options.sourceUrl&&
  (options.pages==="all"||options.pages.includes(x.page)));
}
export function previewPdfBatchLinks(links:PdfExternalLink[],options:PdfBatchLinkEdit):PdfExternalLink[]{
 return matchingPdfLinks(links,options);
}
export async function batchEditPdfExternalLinks(
 bytes:Uint8Array,options:PdfBatchLinkEdit
):Promise<{bytes:Uint8Array;changed:number}>{
 const links=await inspectPdfExternalLinks(bytes);
 const selected=matchingPdfLinks(links,options);
 if(selected.length===0)throw Error("No matching link annotations. Nothing was changed.");
 if(selected.length>MAX_LINKS)throw Error("Too many matching link annotations.");
 const doc=await openPdf(bytes);
 const target=options.action==="replace"?normalizePdfLinkUrl(options.targetUrl??""):"";
 // Group modifications by page and descend annotation indexes. This avoids
 // the index-shifting bug when removing multiple annotations from a page.
 const byPage=new Map<number,number[]>();
 for(const link of selected)byPage.set(link.page,[...(byPage.get(link.page)??[]),link.annotationIndex]);
 for(const [page,indexes] of byPage){
  for(const index of indexes.sort((a,b)=>b-a)){
   const {annotation,annots}=getUriAnnotation(doc,page,index);
   if(readUri(annotation)!==options.sourceUrl)
    throw Error("PDF annotations changed while staging; refusing partial edits.");
   if(options.action==="remove")annots.remove(index);
   else annotation.set(name("A"),doc.context.obj({
    Type:"Action",S:"URI",URI:PDFString.of(target),
   }));
  }
 }
 return {bytes:await doc.save({updateFieldAppearances:false}),changed:selected.length};
}

/** Inventory never accesses the internet. Escape CSV formulas even if the PDF
 * embeds attacker-supplied strings.
 */
export function pdfLinkInventoryCsv(links:PdfExternalLink[]):string{
 const escape=(value:string)=>'"'+
  (/^[\s\uFEFF]*[=+\-@\t\r]/u.test(value)?"'"+value:value).replace(/"/g,'""')+'"';
 const header=["page","annotation_index","url","allowed_http","x","y","width","height"];
 return "\uFEFF"+[
  header,
  ...links.map(l=>[String(l.page),String(l.annotationIndex),l.url,
   l.permitted?"yes":"no",String(l.rect.x),String(l.rect.y),String(l.rect.width),String(l.rect.height)])
 ].map(row=>row.map(escape).join(",")).join("\r\n")+"\r\n";
}
