import {degrees,PDFDocument,rgb,StandardFonts,type PDFPage,type PDFFont} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type PdfAnchor="top-left"|"top-center"|"top-right"|"center"|"bottom-left"|"bottom-center"|"bottom-right";
export type PdfInk={fontSize:number;color:string;opacity:number;anchor:PdfAnchor};
export type PdfFreedomOptions=
  | ({mode:"stamp"|"watermark";text:string;pages:string;fontBytes?:Uint8Array}&PdfInk)
  | ({mode:"numbers";pages:string;prefix:string;suffix:string;start:number;fontBytes?:Uint8Array}&PdfInk)
  | ({mode:"image";pages:string;imageBytes:Uint8Array;imageType:"png"|"jpg";widthPercent:number;opacity:number;anchor:PdfAnchor});

const MAX_PDF_BYTES=25_000_000;
const MAX_PAGES=300;
export function parsePdfSelection(source:string,total:number):number[]{
  if(!Number.isInteger(total)||total<1||total>MAX_PAGES)throw new Error("PDF must contain 1–300 pages.");
  const input=source.trim();
  if(input.toLowerCase()==="all"||input==="1-")return Array.from({length:total},(_,i)=>i);
  const result=new Set<number>();
  for(const piece of input.split(",")){
    const s=piece.trim();
    const m=/^(\d+)(?:-(\d*))?$/u.exec(s);
    if(!m)throw new Error("Use all or ranges such as 1-3,5,8-.");
    const a=Number(m[1]),b=m[2]===undefined?a:m[2]===""?total:Number(m[2]);
    if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<1||b<a||b>total)
      throw new Error("Page selection is outside the document.");
    for(let p=a;p<=b;p++)result.add(p-1);
  }
  if(!result.size)throw new Error("Choose at least one page.");
  return [...result].sort((a,b)=>a-b);
}
export function parsePdfColor(hex:string):{red:number;green:number;blue:number}{
  const match=/^#?([0-9a-f]{6})$/iu.exec(hex);
  if(!match)throw new Error("Use a six-digit hex colour such as #27659C.");
  const raw=match[1];
  return {red:parseInt(raw.slice(0,2),16)/255,green:parseInt(raw.slice(2,4),16)/255,blue:parseInt(raw.slice(4,6),16)/255};
}
export function anchorLocation(
  pageWidth:number,pageHeight:number,boxWidth:number,boxHeight:number,anchor:PdfAnchor,
):{x:number;y:number}{
  const margin=Math.min(36,Math.max(8,Math.min(pageWidth,pageHeight)*.04));
  if(![pageWidth,pageHeight,boxWidth,boxHeight].every(Number.isFinite)||pageWidth<=0||pageHeight<=0||
    boxWidth<=0||boxHeight<=0||boxWidth>pageWidth||boxHeight>pageHeight)
    throw new Error("Overlay does not fit this PDF page.");
  const h=anchor.endsWith("left")?"left":anchor.endsWith("right")?"right":"center";
  const v=anchor.startsWith("top")?"top":anchor.startsWith("bottom")?"bottom":"center";
  const x=h==="left"?margin:h==="right"?pageWidth-margin-boxWidth:(pageWidth-boxWidth)/2;
  const y=v==="top"?pageHeight-margin-boxHeight:v==="bottom"?margin:(pageHeight-boxHeight)/2;
  return {x:Math.max(0,Math.min(pageWidth-boxWidth,x)),y:Math.max(0,Math.min(pageHeight-boxHeight,y))};
}
function inkCheck(ink:PdfInk){
  if(!Number.isFinite(ink.fontSize)||ink.fontSize<8||ink.fontSize>120)
    throw new Error("Font size must be between 8 and 120 pt.");
  if(!Number.isFinite(ink.opacity)||ink.opacity<.05||ink.opacity>1)
    throw new Error("Opacity must be between 0.05 and 1.");
  parsePdfColor(ink.color);
}
function validateLine(value:string,limit:number){
  if(!value.trim()||value.length>limit||/[\r\n\u0000-\u001f]/u.test(value))
    throw new Error("Enter a single-line label within "+limit+" characters.");
}
async function chooseFont(pdf:PDFDocument,bytes:Uint8Array|undefined,text:string):Promise<PDFFont>{
  if(bytes){
    if(bytes.length<100||bytes.length>12_000_000)throw new Error("Font file must be 100 bytes to 12 MB.");
    pdf.registerFontkit(fontkit);
    try{return await pdf.embedFont(bytes,{subset:true});}
    catch{throw new Error("Could not embed this TTF/OTF font. Choose a different local font.");}
  }
  if(/[^\x20-\x7E]/u.test(text))throw new Error("For Chinese or other non-ASCII text, choose a local TTF/OTF font.");
  return pdf.embedFont(StandardFonts.Helvetica);
}
function drawLabel(page:PDFPage,font:PDFFont,text:string,ink:PdfInk){
  const c=parsePdfColor(ink.color);
  const width=font.widthOfTextAtSize(text,ink.fontSize),height=font.heightAtSize(ink.fontSize);
  if(width===0)throw new Error("Text cannot be rendered with the selected font.");
  const target=anchorLocation(page.getWidth(),page.getHeight(),width,height,ink.anchor);
  page.drawText(text,{x:target.x,y:target.y,font,size:ink.fontSize,color:rgb(c.red,c.green,c.blue),opacity:ink.opacity});
}
function drawWatermark(page:PDFPage,font:PDFFont,text:string,ink:PdfInk){
  const c=parsePdfColor(ink.color);
  // Fit a diagonal watermark inside its page using a bounded font size.
  const diagonal=Math.hypot(page.getWidth(),page.getHeight());
  const proposed=font.widthOfTextAtSize(text,ink.fontSize);
  const fontSize=Math.min(ink.fontSize,ink.fontSize*(diagonal*.67/Math.max(proposed,1)));
  if(fontSize<5)throw new Error("Watermark is too long for this page.");
  const textWidth=font.widthOfTextAtSize(text,fontSize);
  const angle=35*Math.PI/180;
  const x=page.getWidth()/2-Math.cos(angle)*textWidth/2;
  const y=page.getHeight()/2-Math.sin(angle)*textWidth/2;
  page.drawText(text,{x,y,font,size:fontSize,rotate:degrees(35),
    color:rgb(c.red,c.green,c.blue),opacity:ink.opacity});
}
export async function applyPdfFreedom(source:Uint8Array,options:PdfFreedomOptions):Promise<Uint8Array>{
  if(source.length===0||source.length>MAX_PDF_BYTES)throw new Error("PDF input must be no larger than 25 MB.");
  const pdf=await PDFDocument.load(source);
  const total=pdf.getPageCount(),selected=parsePdfSelection(options.pages,total);
  if(total>MAX_PAGES)throw new Error("PDF must contain at most 300 pages.");
  if(options.mode==="image"){
    if(options.imageBytes.length===0||options.imageBytes.length>8_000_000)throw new Error("Image must be 1 byte–8 MB.");
    if(!Number.isFinite(options.widthPercent)||options.widthPercent<5||options.widthPercent>85)
      throw new Error("Image width must be between 5% and 85%.");
    if(!Number.isFinite(options.opacity)||options.opacity<.05||options.opacity>1)
      throw new Error("Opacity must be between 0.05 and 1.");
    const image=options.imageType==="png"?await pdf.embedPng(options.imageBytes):await pdf.embedJpg(options.imageBytes);
    for(const index of selected){
      const page=pdf.getPage(index);
      const maxWidth=page.getWidth()*options.widthPercent/100;
      const width=Math.min(maxWidth,page.getHeight()*.85*image.width/image.height);
      const height=width*image.height/image.width;
      const pos=anchorLocation(page.getWidth(),page.getHeight(),width,height,options.anchor);
      page.drawImage(image,{x:pos.x,y:pos.y,width,height,opacity:options.opacity});
    }
  }else{
    inkCheck(options);
    let labels:string[];
    if(options.mode==="numbers"){
      if(!Number.isSafeInteger(options.start)||options.start<0||options.start>100000)
        throw new Error("Page number start must be an integer from 0 to 100,000.");
      if(options.prefix.length>40||options.suffix.length>40||/[\r\n\u0000-\u001f]/u.test(options.prefix+options.suffix))
        throw new Error("Page number prefix/suffix must be single-line and 40 characters or fewer.");
      labels=selected.map((_,i)=>options.prefix+String(options.start+i)+options.suffix);
    }else{
      validateLine(options.text,120);
      labels=[options.text];
    }
    const font=await chooseFont(pdf,options.fontBytes,labels.join(""));
    selected.forEach((index,i)=>{
      const label=options.mode==="numbers"?labels[i]:labels[0];
      // No text is removed: this adds a visible overlay to the PDF.
      if(options.mode==="watermark")drawWatermark(pdf.getPage(index),font,label,options);
      else drawLabel(pdf.getPage(index),font,label,options);
    });
  }
  return pdf.save({useObjectStreams:true});
}
