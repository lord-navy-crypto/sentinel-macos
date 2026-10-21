/** Offline CSV -> itemised business quotation / invoice planning.
 * Integer cents + integer tax basis points. Not a tax compliance or payment service.
 */
import {parseWorkspaceCsv} from "./csvCleanroom";
import {mergedCsvExport} from "./csvMerge";

export type SellerDetails={name:string;address:string;taxId:string;paymentDetails:string};
export type BillingKind="invoice"|"quote";
export type BillingLine={description:string;quantity:number;unitCents:number;taxBasisPoints:number;netCents:number;taxCents:number;totalCents:number};
export type BillingDocument={
 id:string;kind:BillingKind;client:string;clientAddress:string;issueDate:string;dueDate:string;
 currency:"USD"|"EUR"|"GBP"|"CNY";po:string;lines:BillingLine[];subtotalCents:number;taxCents:number;totalCents:number;
};
export type BillingBatch={seller:SellerDetails;documents:BillingDocument[];lineCount:number;summaryCsv:string};
export const BILLING_HEADERS=["document_id","kind","client","client_address","issue_date","due_date","currency","po","description","quantity","unit_price","tax_rate"];
export const BILLING_EXAMPLE=[
 BILLING_HEADERS.join(","),
 "INV-001,invoice,Northwind Studio,10 Market Lane,2026-10-21,2026-11-04,EUR,PO-101,Website audit,2,125.00,0",
 "INV-001,invoice,Northwind Studio,10 Market Lane,2026-10-21,2026-11-04,EUR,PO-101,Report and handoff,1,75.50,0",
 "QT-002,quote,Example Client,20 Office Road,2026-10-21,2026-11-20,EUR,,Prototype review,3,80.00,0",
].join("\n");
const limit=(s:string,max:number,label:string,required=true):string=>{
 const text=s.trim();
 if((required&&!text)||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))
  throw Error(label+" is missing, too long or contains control characters.");
 return text;
};
const isoDate=(s:string,label:string)=>{
 const value=limit(s,10,label);
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(value)||Number.isNaN(Date.parse(value+"T00:00:00Z"))||
  new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)
  throw Error("Use a real YYYY-MM-DD "+label+".");
 return value;
};
const decimalUnits=(raw:string,label:string,maxUnits:number)=>{
 const s=raw.trim();
 if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/u.test(s))
  throw Error(label+" must be nonnegative, with up to 2 decimal places.");
 const [integer,fraction=""]=s.split(".");
 const hundredths=Number(integer)*100+Number(fraction.padEnd(2,"0"));
 if(!Number.isSafeInteger(hundredths)||hundredths>maxUnits*100)
  throw Error(label+" exceeds the allowed limit.");
 return hundredths;
};
export function formatCents(cents:number):string{
 if(!Number.isSafeInteger(cents)||cents<0)throw Error("Invalid currency amount.");
 return (cents/100).toFixed(2);
}
export function parseBusinessBilling(raw:string,seller:SellerDetails):BillingBatch{
 const verifiedSeller:SellerDetails={
  name:limit(seller.name,110,"Business name"),
  address:limit(seller.address,240,"Business address"),
  taxId:limit(seller.taxId,70,"Tax / registration number",false),
  paymentDetails:limit(seller.paymentDetails,240,"Payment / notes",false),
 };
 if(raw.length>350_000)throw Error("CSV must be 350,000 characters or fewer.");
 const rows=parseWorkspaceCsv(raw);
 if(rows.length<2||rows.length>101)throw Error("Supply 1–100 line items in the CSV.");
 const headers=rows[0].map(x=>x.trim().toLowerCase());
 if(headers.length!==BILLING_HEADERS.length||new Set(headers).size!==headers.length||
  headers.some((h,i)=>h!==BILLING_HEADERS[i]))
  throw Error("CSV headings must match the supplied sample, in order.");
 const docs=new Map<string,BillingDocument>();
 for(let n=1;n<rows.length;n++){
  const row=rows[n],lineNumber=n+1;
  if(row.length!==headers.length)throw Error("CSV line "+lineNumber+" has the wrong number of columns.");
  const [rawId,rawKind,rawClient,rawAddress,rawDate,rawDue,rawCurrency,rawPo,rawDescription,rawQuantity,rawPrice,rawTax]=row;
  const id=limit(rawId,50,"Document number at line "+lineNumber);
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/u.test(id))
   throw Error("Document numbers may only use A–Z, 0–9, dot, underscore and hyphen.");
  const kind=rawKind.trim().toLowerCase();
  if(kind!=="invoice"&&kind!=="quote")throw Error("Use invoice or quote in line "+lineNumber+".");
  const client=limit(rawClient,120,"Client at line "+lineNumber);
  const clientAddress=limit(rawAddress,240,"Client address at line "+lineNumber);
  const issueDate=isoDate(rawDate,"issue date at line "+lineNumber);
  const dueDate=isoDate(rawDue,"due date at line "+lineNumber);
  if(dueDate<issueDate)throw Error("Due/valid-until date precedes issue date at line "+lineNumber+".");
  const currency=rawCurrency.trim().toUpperCase();
  if(!["USD","EUR","GBP","CNY"].includes(currency))throw Error("Unsupported currency at line "+lineNumber+".");
  const po=limit(rawPo,80,"PO reference at line "+lineNumber,false);
  const description=limit(rawDescription,180,"Description at line "+lineNumber);
  if(!/^\d+$/u.test(rawQuantity.trim()))throw Error("Quantity must be a positive whole number at line "+lineNumber+".");
  const quantity=Number(rawQuantity.trim());
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000)throw Error("Quantity must be 1–1000 at line "+lineNumber+".");
  const unitCents=decimalUnits(rawPrice,"Unit price",1_000_000);
  const taxBasisPoints=decimalUnits(rawTax,"Tax rate (%)",100)*1;
  if(taxBasisPoints>10_000)throw Error("Tax rate cannot exceed 100%.");
  const netCents=unitCents*quantity,taxCents=Math.round(netCents*taxBasisPoints/10_000);
  const totalCents=netCents+taxCents;
  if(!Number.isSafeInteger(totalCents)||totalCents>200_000_000)throw Error("Line monetary total is too large.");
  const previous=docs.get(id);
  if(previous){
   if(previous.kind!==kind||previous.client!==client||previous.clientAddress!==clientAddress||
    previous.issueDate!==issueDate||previous.dueDate!==dueDate||previous.currency!==currency||previous.po!==po)
    throw Error("Repeated document number "+id+" has conflicting header fields on line "+lineNumber+".");
   previous.lines.push({description,quantity,unitCents,taxBasisPoints,netCents,taxCents,totalCents});
  }else{
   if(docs.size>=25)throw Error("A batch can contain up to 25 documents.");
   docs.set(id,{id,kind:kind as BillingKind,client,clientAddress,issueDate,dueDate,
    currency:currency as BillingDocument["currency"],po,
    lines:[{description,quantity,unitCents,taxBasisPoints,netCents,taxCents,totalCents}],
    subtotalCents:0,taxCents:0,totalCents:0});
  }
 }
 const documents=[...docs.values()];
 for(const doc of documents){
  doc.subtotalCents=doc.lines.reduce((sum,x)=>sum+x.netCents,0);
  doc.taxCents=doc.lines.reduce((sum,x)=>sum+x.taxCents,0);
  doc.totalCents=doc.subtotalCents+doc.taxCents;
  if(doc.totalCents>200_000_000)throw Error("Document "+doc.id+" exceeds the monetary safety limit.");
 }
 const summaryCsv=mergedCsvExport({headers:["document_id","kind","client","issue_date","due_date","currency","lines","net","tax","total"],
  rows:documents.map(x=>[x.id,x.kind,x.client,x.issueDate,x.dueDate,x.currency,String(x.lines.length),
   formatCents(x.subtotalCents),formatCents(x.taxCents),formatCents(x.totalCents)])});
 return {seller:verifiedSeller,documents,lineCount:rows.length-1,summaryCsv};
}
export function pdfLatinCompatible(batch:BillingBatch,doc:BillingDocument):boolean{
 const fields=[batch.seller.name,batch.seller.address,batch.seller.taxId,batch.seller.paymentDetails,
  doc.id,doc.client,doc.clientAddress,doc.po,...doc.lines.map(x=>x.description)];
 return fields.every(value=>/^[\x20-\x7e\r\n]*$/u.test(value));
}
