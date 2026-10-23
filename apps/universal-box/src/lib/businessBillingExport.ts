/** Actual DOCX and safe Latin PDF output for offline itemised invoices / quotations. */
import JSZip from "jszip";
import {AlignmentType,Document,HeadingLevel,Packer,Paragraph,Table,TableCell,TableRow,TextRun,WidthType} from "docx";
import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage} from "pdf-lib";
import {formatCents,pdfLatinCompatible,type BillingBatch,type BillingDocument,type SellerDetails} from "./businessBilling";

type CellContent=string|number;
const makeParagraph=(text:string,bold=false)=>new Paragraph({children:[new TextRun({text,bold,font:"Arial",size:20})],spacing:{after:100}});
const td=(value:CellContent,bold=false)=>new TableCell({children:[makeParagraph(String(value),bold)],margins:{top:90,bottom:65,left:90,right:90}});
function makeDocx(batch:BillingBatch,doc:BillingDocument):Document{
 const title=doc.kind==="invoice"?"INVOICE / 发票":"QUOTATION / 报价单";
 const info=[
  makeParagraph(batch.seller.name,true),makeParagraph(batch.seller.address),
  ...(batch.seller.taxId?[makeParagraph("Registration / Tax ID: "+batch.seller.taxId)]:[]),
  new Paragraph({text:title,heading:HeadingLevel.HEADING_1,spacing:{before:300,after:150}}),
  makeParagraph("Document No.: "+doc.id,true),makeParagraph("Issue date: "+doc.issueDate),
  makeParagraph((doc.kind==="invoice"?"Due date: ":"Valid until: ")+doc.dueDate),
  makeParagraph("Client: "+doc.client,true),makeParagraph("Client address: "+doc.clientAddress),
  ...(doc.po?[makeParagraph("PO reference: "+doc.po)]:[]),
 ];
 const header=["Description","Qty","Unit price","Tax %","Net","Tax","Line total"];
 const rows=[
  new TableRow({children:header.map(x=>td(x,true))}),
  ...doc.lines.map(x=>new TableRow({children:[
   td(x.description),td(x.quantity),td(doc.currency+" "+formatCents(x.unitCents)),
   td((x.taxBasisPoints/100).toFixed(2)+"%"),
   td(formatCents(x.netCents)),td(formatCents(x.taxCents)),td(formatCents(x.totalCents)),
  ]})),
 ];
 const notes=[makeParagraph("Subtotal: "+doc.currency+" "+formatCents(doc.subtotalCents)),
  makeParagraph("Total tax: "+doc.currency+" "+formatCents(doc.taxCents)),
  makeParagraph("TOTAL: "+doc.currency+" "+formatCents(doc.totalCents),true),
  ...(batch.seller.paymentDetails?[makeParagraph("Payment / notes: "+batch.seller.paymentDetails)]:[]),
  makeParagraph("Check local tax / invoice rules before issuing. No payment has been made or recorded."),
 ];
 return new Document({
  creator:"Sentinel Box",title:doc.kind+" "+doc.id,
  sections:[{properties:{},children:[
   ...info,
   new Table({rows,width:{size:100,type:WidthType.PERCENTAGE}}),
   ...notes,
  ]}],
 });
}
function breakAt(font:PDFFont,text:string,size:number,width:number):string[]{
 const output:string[]=[];
 for(const paragraph of text.split(/\r?\n/u)){
  if(!paragraph){output.push("");continue;}
  let line="";
  for(const c of paragraph){
   if(font.widthOfTextAtSize(line+c,size)>width&&line){output.push(line);line=c;}
   else line+=c;
  }
  output.push(line);
 }
 return output;
}
export async function createLatinBillingPdf(batch:BillingBatch,doc:BillingDocument):Promise<Uint8Array>{
 if(!pdfLatinCompatible(batch,doc))throw Error("Vector PDF supports Latin ASCII only; the bilingual editable Word is still generated.");
 const pdf=await PDFDocument.create();
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const pageSize:[number,number]=[595.28,841.89];
 let page:PDFPage=pdf.addPage(pageSize),y=797;
 const ink=rgb(.12,.20,.31),light=rgb(.39,.45,.54);
 function fresh(){
  page=pdf.addPage(pageSize);y=797;
  page.drawText("Sentinel Box | "+(doc.kind==="invoice"?"INVOICE ":"QUOTATION ")+doc.id,
   {x:45,y:814,size:9,font:bold,color:light});y=783;
 }
 function need(height:number){if(y-height<65)fresh();}
 function line(value:string,size=10,strong=false,indent=0){
  const f=strong?bold:regular;
  for(const chunk of breakAt(f,value,size,500-indent)){
   need(size+8);
   page.drawText(chunk,{x:45+indent,y,font:f,size,color:ink});
   y-=size+7;
  }
 }
 page.drawRectangle({x:0,y:812,width:595.28,height:30,color:rgb(.09,.23,.39)});
 page.drawText("SENTINEL BOX  |  BUSINESS DOCUMENT",{x:45,y:823,font:bold,size:10,color:rgb(1,1,1)});
 line(doc.kind==="invoice"?"INVOICE":"QUOTATION",19,true);
 line(batch.seller.name,12,true);line(batch.seller.address,9);
 if(batch.seller.taxId)line("Registration / Tax ID: "+batch.seller.taxId,9);
 y-=12;
 line("Document: "+doc.id,11,true);
 line("Issued: "+doc.issueDate+"    "+(doc.kind==="invoice"?"Due: ":"Valid until: ")+doc.dueDate,10);
 line("Client: "+doc.client,11,true);line(doc.clientAddress,9);
 if(doc.po)line("PO: "+doc.po,9);
 y-=13;need(28);
 page.drawRectangle({x:45,y:y-9,width:504,height:21,color:rgb(.90,.94,.98)});
 page.drawText("ITEM",{x:52,y:y-3,font:bold,size:10,color:ink});
 page.drawText("QUANTITY / PRICE / TAX",{x:327,y:y-3,font:bold,size:9,color:ink});
 y-=30;
 for(const [i,item] of doc.lines.entries()){
  need(65);
  line(String(i+1)+". "+item.description,10,true);
  line("Qty "+item.quantity+"  x  "+doc.currency+" "+formatCents(item.unitCents)+
   "   Tax "+(item.taxBasisPoints/100).toFixed(2)+"%  =  "+doc.currency+" "+formatCents(item.totalCents),9,false,12);
  y-=5;
 }
 need(100);y-=8;
 line("Subtotal: "+doc.currency+" "+formatCents(doc.subtotalCents),11);
 line("Tax: "+doc.currency+" "+formatCents(doc.taxCents),11);
 line("TOTAL: "+doc.currency+" "+formatCents(doc.totalCents),15,true);
 y-=10;
 if(batch.seller.paymentDetails)line("Payment / notes: "+batch.seller.paymentDetails,9);
 line("Verify invoice requirements for your jurisdiction. No payment processed.",8);
 for(let i=0;i<pdf.getPageCount();i++){
  const p=pdf.getPage(i);
  p.drawText("Page "+(i+1)+" of "+pdf.getPageCount()+"  |  Created offline by Sentinel Box",
   {x:45,y:32,size:8,font:regular,color:light});
 }
 const result=await pdf.save({useObjectStreams:true});
 const loaded=await PDFDocument.load(result);
 if(loaded.getPageCount()<1)throw Error("Generated PDF failed page-count validation.");
 return result;
}
export type BillingArchiveResult={bytes:Uint8Array;pdfCount:number;wordCount:number;pdfSkipped:string[]};
export async function exportBillingBatch(batch:BillingBatch):Promise<BillingArchiveResult>{
 if(batch.documents.length<1||batch.documents.length>25)throw Error("Invalid number of billing documents.");
 const zip=new JSZip(),pdfSkipped:string[]=[];
 zip.file("reports/billing-summary.csv",batch.summaryCsv);
 for(const doc of batch.documents){
  const folder=doc.kind==="invoice"?"invoices":"quotes";
  const word=await Packer.toBlob(makeDocx(batch,doc));
  zip.file(folder+"/"+doc.id+".docx",new Uint8Array(await word.arrayBuffer()));
  if(pdfLatinCompatible(batch,doc)){
   zip.file(folder+"/"+doc.id+".pdf",await createLatinBillingPdf(batch,doc));
  }else pdfSkipped.push(doc.id+": non-ASCII input; editable DOCX only");
 }
 zip.file("reports/manifest.json",JSON.stringify({
  generator:"Sentinel Box",mode:"Local business invoices and quotes",
  documents:batch.documents.map(x=>({id:x.id,kind:x.kind,currency:x.currency,items:x.lines.length,total:formatCents(x.totalCents)})),
  pdfSkipped,
  warnings:["User-supplied tax rates; no VAT or jurisdiction compliance certification.",
   "CSV data is not sent anywhere, and no email/payment/collection is performed.",
   "PDF output is only created for Latin ASCII fields; DOCX supports multilingual text.",
   "Review all generated files, figures and recipient details before issuing."],
 },null,2));
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
 if(bytes.length>20_000_000)throw Error("Billing archive exceeds 20 MB.");
 return {bytes,pdfCount:batch.documents.length-pdfSkipped.length,wordCount:batch.documents.length,pdfSkipped};
}
