import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {PDFDocument} from "pdf-lib";
import {BILLING_EXAMPLE,BILLING_HEADERS,parseBusinessBilling} from "./businessBilling";
import {exportBillingBatch} from "./businessBillingExport";
const seller={name:"Example Studio",address:"1 Main Street",taxId:"",paymentDetails:"Pay by transfer"};
describe("Actual business document ZIP, editable Word and vector PDF output",()=>{
 it("generates separate real DOCX/PDF files and summary with correct page reads",async()=>{
  const batch=parseBusinessBilling(BILLING_EXAMPLE,seller);
  const result=await exportBillingBatch(batch);
  expect(result.wordCount).toBe(2);
  expect(result.pdfCount).toBe(2);
  expect(result.pdfSkipped).toHaveLength(0);
  const archive=await JSZip.loadAsync(result.bytes,{checkCRC32:true});
  for(const path of ["invoices/INV-001.docx","invoices/INV-001.pdf",
   "quotes/QT-002.docx","quotes/QT-002.pdf","reports/billing-summary.csv","reports/manifest.json"]){
   expect(archive.file(path),path).not.toBeNull();
  }
  const word=await JSZip.loadAsync(await archive.file("invoices/INV-001.docx")!.async("uint8array"));
  const xml=await word.file("word/document.xml")!.async("string");
  expect(xml).toContain("Northwind Studio");
  expect(xml).toContain("325.50");
  const pdf=await PDFDocument.load(await archive.file("invoices/INV-001.pdf")!.async("uint8array"));
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(pdf.getPages()[0].getWidth()).toBeCloseTo(595.28,1);
  const summary=await archive.file("reports/billing-summary.csv")!.async("string");
  expect(summary).toContain("325.50");expect(summary).toContain("QT-002");
  const manifest=JSON.parse(await archive.file("reports/manifest.json")!.async("string"));
  expect(manifest.documents.length).toBe(2);
 });
 it("does not create a misleading missing-glyph PDF for a Chinese document",async()=>{
  const csv=BILLING_HEADERS.join(",")+
   "\nCN-01,invoice,中文客户,北京市,2026-10-21,2026-11-10,CNY,,编程服务,2,150.00,0";
  const result=await exportBillingBatch(parseBusinessBilling(csv,seller));
  expect(result.wordCount).toBe(1);expect(result.pdfCount).toBe(0);
  expect(result.pdfSkipped).toHaveLength(1);
  const zip=await JSZip.loadAsync(result.bytes);
  expect(zip.file("invoices/CN-01.pdf")).toBeNull();
  const docx=await JSZip.loadAsync(await zip.file("invoices/CN-01.docx")!.async("uint8array"));
  const xml=await docx.file("word/document.xml")!.async("string");
  expect(xml).toContain("中文客户");
  expect(xml).toContain("编程服务");
 });
});
