/** Small, local PDF edits. Do not mistake CropBox or metadata changes for redaction/anonymization. */
import {PDFDocument,PDFTextField} from "pdf-lib";
const MAX_INPUT=15_000_000,MAX_PAGES=200;
export type PdfBasicInfo={
  pages:number;dimensions:{page:number;width:number;height:number;rotation:number}[];
  title:string;author:string;subject:string;keywords:string;
  creator:string;producer:string;
};
export type PdfMetadataEdit={title:string;author:string;subject:string;keywords:string};
export type PdfCropMargins={left:number;right:number;top:number;bottom:number};
export type PdfFormText={name:string;text:string;readOnly:boolean;maxLength:number|undefined};
async function loadInput(input:Uint8Array):Promise<PDFDocument>{
  if(input.length<100||input.length>MAX_INPUT)throw Error("PDF file must be 100 bytes to 15 MB.");
  const doc=await PDFDocument.load(input,{updateMetadata:false});
  if(doc.getPageCount()<1||doc.getPageCount()>MAX_PAGES)
    throw Error("PDF must have 1–200 pages.");
  return doc;
}
export async function inspectPdfEveryday(input:Uint8Array):Promise<PdfBasicInfo>{
  const doc=await loadInput(input);
  return {
    pages:doc.getPageCount(),
    dimensions:doc.getPages().map((p,i)=>{
      const b=p.getCropBox();
      return {page:i+1,width:Number(b.width.toFixed(2)),height:Number(b.height.toFixed(2)),rotation:p.getRotation().angle};
    }),
    title:doc.getTitle()??"",author:doc.getAuthor()??"",
    subject:doc.getSubject()??"",keywords:doc.getKeywords()??"",
    creator:doc.getCreator()??"",producer:doc.getProducer()??"",
  };
}
function validateMetadata(edit:PdfMetadataEdit){
  for(const [name,value] of Object.entries(edit)){
    if(value.length>250||/[\u0000-\u001f]/u.test(value))
      throw Error("PDF "+name+" must be <=250 characters without control characters.");
  }
}
export async function savePdfMetadata(input:Uint8Array,edit:PdfMetadataEdit):Promise<Uint8Array>{
  validateMetadata(edit);
  const doc=await loadInput(input);
  doc.setTitle(edit.title);doc.setAuthor(edit.author);doc.setSubject(edit.subject);
  doc.setKeywords(edit.keywords.split(/[,，]/u).map(s=>s.trim()).filter(Boolean).slice(0,30));
  return doc.save({updateFieldAppearances:false});
}
export async function cropPdfPages(
  input:Uint8Array,margins:PdfCropMargins,pageSelection:"all"|number,
):Promise<Uint8Array>{
  for(const [side,pct] of Object.entries(margins)){
    if(!Number.isFinite(pct)||pct<0||pct>45)throw Error("Crop "+side+" must be 0–45%.");
  }
  if(margins.left+margins.right>=90||margins.top+margins.bottom>=90)
    throw Error("Cropping removes too much of the visible page.");
  if(Object.values(margins).every(v=>v===0))throw Error("Enter at least one nonzero crop margin.");
  const doc=await loadInput(input);
  const chosen=pageSelection==="all"?doc.getPages():[
    ...(Number.isSafeInteger(pageSelection)&&pageSelection>=1&&pageSelection<=doc.getPageCount()
    ?[doc.getPage(pageSelection-1)]:[]),
  ];
  if(!chosen.length)throw Error("Selected PDF page is outside the document.");
  for(const page of chosen){
    const b=page.getCropBox();
    const l=b.width*margins.left/100,r=b.width*margins.right/100;
    const top=b.height*margins.top/100,bottom=b.height*margins.bottom/100;
    const width=b.width-l-r,height=b.height-top-bottom;
    if(width<20||height<20)throw Error("Crop would leave fewer than 20 PDF points.");
    page.setCropBox(b.x+l,b.y+bottom,width,height);
  }
  return doc.save({updateFieldAppearances:false});
}
export type PageFormat="a4"|"letter"|"same-as-first";
export async function insertBlankPdfPages(
  input:Uint8Array,afterPage:number,count:number,pageFormat:PageFormat,
):Promise<Uint8Array>{
  const doc=await loadInput(input);
  if(!Number.isSafeInteger(afterPage)||afterPage<0||afterPage>doc.getPageCount())
    throw Error("Position must be between 0 (start) and the document page count.");
  if(!Number.isSafeInteger(count)||count<1||count>10)
    throw Error("Insert 1–10 pages per operation.");
  let size:[number,number];
  if(pageFormat==="a4")size=[595.28,841.89];
  else if(pageFormat==="letter")size=[612,792];
  else if(pageFormat==="same-as-first"){
    const first=doc.getPage(0).getSize();
    size=[first.width,first.height];
  }else throw Error("Unsupported blank-page format.");
  if(size.some(v=>!Number.isFinite(v)||v<20||v>2000))
    throw Error("First-page dimensions are not supported for blank-page insertion.");
  for(let i=0;i<count;i++)doc.insertPage(afterPage+i,size);
  return doc.save({updateFieldAppearances:false});
}
/** Basic AcroForm text fields only. No XFA/rich text, signatures, checkboxes, or CJK font support. */
export async function inspectPdfTextFields(input:Uint8Array):Promise<PdfFormText[]>{
  const doc=await loadInput(input);
  const fields=doc.getForm().getFields();
  if(fields.length>100)throw Error("Form has over 100 fields.");
  return fields.filter((f):f is PDFTextField=>f instanceof PDFTextField).map(field=>({
    name:field.getName(),
    text:field.getText()??"",
    readOnly:field.isReadOnly(),
    maxLength:field.getMaxLength(),
  }));
}
export async function fillPdfTextFields(
  input:Uint8Array,values:Record<string,string>,
):Promise<Uint8Array>{
  const entries=Object.entries(values);
  if(!entries.length||entries.length>40)throw Error("Select 1–40 text fields.");
  const doc=await loadInput(input);
  const fields=doc.getForm().getFields().filter((f):f is PDFTextField=>f instanceof PDFTextField);
  if(fields.length>100)throw Error("Form has over 100 fields.");
  const allowed=new Map(fields.map(f=>[f.getName(),f]));
  for(const [name,value] of entries){
    const field=allowed.get(name);
    if(!field)throw Error("PDF text field was not found: "+name);
    if(field.isReadOnly())throw Error("Cannot modify read-only PDF field "+name);
    if(value.length>500||/[^ -~]/u.test(value))
      throw Error("Basic form filler currently supports up to 500 printable ASCII characters per field.");
    if(field.getMaxLength()!==undefined&&value.length>field.getMaxLength()!)
      throw Error("Text exceeds the PDF field's maximum length: "+name);
    field.setText(value);
  }
  // pdf-lib builds appearances with WinAnsi Helvetica; output values are limited to printable ASCII.
  return doc.save();
}

/** Extract or reorder PDF pages with explicit ranges such as 3,1-2,5. Duplicates intentionally supported. */
export function parsePdfPageOrder(expression:string,total:number):number[]{
  if(!Number.isSafeInteger(total)||total<1||total>200)throw Error("PDF must contain 1–200 pages.");
  const tokens=expression.trim().split(",");
  if(!expression.trim()||tokens.length>200)throw Error("Enter pages such as 3,1-2,5.");
  const pages:number[]=[];
  for(const token of tokens){
    const match=/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/u.exec(token);
    if(!match)throw Error("Use page numbers and ranges such as 3,1-2,5.");
    const start=Number(match[1]),end=match[2]===undefined?start:Number(match[2]);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end>total)
      throw Error("Page range exceeds the document or is reversed.");
    for(let i=start;i<=end;i++){
      pages.push(i-1);
      if(pages.length>200)throw Error("Output may contain at most 200 pages.");
    }
  }
  return pages;
}
export async function exportSelectedPdfPages(input:Uint8Array,expression:string):Promise<Uint8Array>{
  const source=await loadInput(input);
  const indices=parsePdfPageOrder(expression,source.getPageCount());
  const output=await PDFDocument.create();
  for(const index of indices){
    const [page]=await output.copyPages(source,[index]);
    output.addPage(page);
  }
  return output.save({useObjectStreams:true});
}
