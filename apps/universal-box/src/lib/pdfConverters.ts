import {PDFDocument} from "pdf-lib";

export type ImagePdfPageSize="a4"|"letter"|"fit";
export type ImagePdfInput={name:string;mime:"image/png"|"image/jpeg";bytes:Uint8Array};
const PAGE_A4:[number,number]=[595.28,841.89];
const PAGE_LETTER:[number,number]=[612,792];
export function imagePageGeometry(imageWidth:number,imageHeight:number,pageSize:ImagePdfPageSize){
  if(!Number.isFinite(imageWidth)||!Number.isFinite(imageHeight)||imageWidth<1||imageHeight<1
    ||imageWidth*imageHeight>40_000_000)throw new Error("Image dimensions are invalid or exceed 40 million pixels.");
  let pageWidth:number,pageHeight:number,margin:number;
  if(pageSize==="fit"){
    // Constrain all custom image pages to realistic PDF display dimensions.
    const factor=Math.min(595/imageWidth,841/imageHeight);
    pageWidth=imageWidth*factor;
    pageHeight=imageHeight*factor;
    margin=0;
  }else{
    [pageWidth,pageHeight]=pageSize==="letter"?PAGE_LETTER:PAGE_A4;
    margin=24;
  }
  const scale=Math.min((pageWidth-2*margin)/imageWidth,(pageHeight-2*margin)/imageHeight);
  const width=imageWidth*scale,height=imageHeight*scale;
  return {pageWidth,pageHeight,x:(pageWidth-width)/2,y:(pageHeight-height)/2,width,height};
}
export async function imagesToPdf(images:ImagePdfInput[],pageSize:ImagePdfPageSize):Promise<Uint8Array>{
  if(images.length<1||images.length>12)throw new Error("Choose 1–12 JPEG or PNG images.");
  if(images.reduce((sum,item)=>sum+item.bytes.length,0)>25_000_000)throw new Error("Total images must be 25 MB or less.");
  const pdf=await PDFDocument.create();
  pdf.setTitle("Daily Desk Images");
  pdf.setCreator("Daily Desk");
  for(const file of images){
    if(file.bytes.length===0||file.bytes.length>8_000_000)throw new Error("Each image must be 1 byte–8 MB.");
    const image=file.mime==="image/png"?await pdf.embedPng(file.bytes):await pdf.embedJpg(file.bytes);
    const box=imagePageGeometry(image.width,image.height,pageSize);
    const page=pdf.addPage([box.pageWidth,box.pageHeight]);
    page.drawImage(image,{x:box.x,y:box.y,width:box.width,height:box.height});
  }
  const output=await pdf.save({useObjectStreams:true});
  if(output.length>20_000_000)throw new Error("Result exceeds the 20 MB export limit.");
  return output;
}
