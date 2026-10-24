import {it,expect,describe} from "vitest";
import {parsePdfOrder,previewPdfOrder,exportReorderedPdf} from "./pdfPageOrder";
import {PDFDocument,degrees} from "pdf-lib";
describe("PDF page organizer",()=>{
  it("keeps requested order without mutating source",()=>{
    expect(parsePdfOrder("3,1,2,5-6",6)).toEqual([2,0,1,4,5]);
  });
  it("rejects duplicate pages",()=>{
    expect(()=>parsePdfOrder("1,2,2",5)).toThrow(/more than once/);
    expect(()=>parsePdfOrder("1-3,2",5)).toThrow(/more than once/);
  });
  it("rejects missing and invalid pages",()=>{
    expect(()=>parsePdfOrder("",5)).toThrow(/Keep at least/);
    expect(()=>parsePdfOrder("1,6",5)).toThrow(/bounds/);
    expect(()=>parsePdfOrder("3-2",5)).toThrow(/bounds/);
    expect(()=>parsePdfOrder("1;2",5)).toThrow(/sequence/);
  });
});
describe("Office PDF reorder preflight and actual output verification",()=>{
 it("shows output-to-source mapping and omitted-page count before reading or saving",()=>{
  expect(previewPdfOrder("3,1,4-5",5)).toEqual({
   originalCount:5,outputCount:4,removedCount:1,order:[2,0,3,4],
   mapping:[{outputPage:1,sourcePage:3},{outputPage:2,sourcePage:1},
    {outputPage:3,sourcePage:4},{outputPage:4,sourcePage:5}],
  });
  expect(()=>previewPdfOrder("2,2",4)).toThrow(/more than once/);
  expect(()=>previewPdfOrder("0,1",4)).toThrow(/bounds/);
  expect(()=>previewPdfOrder("",4)).toThrow(/Keep at least/);
 });
 it("exports a truly reordered PDF with actual rotation, crop and media boxes, without modifying source",async()=>{
  const doc=await PDFDocument.create();
  for(let i=0;i<4;i++){
   const page=doc.addPage([350+i*50,550+i*10]);
   page.setRotation(degrees(i*90));
   if(i===2)page.setCropBox(6,7,200,300);
  }
  const snapshot=await doc.save();
  const result=await exportReorderedPdf(doc,"3,1");
  expect(result.plan.removedCount).toBe(2);
  const checked=await PDFDocument.load(result.bytes);
  expect(checked.getPageCount()).toBe(2);
  expect(checked.getPage(0).getWidth()).toBe(450);
  expect(checked.getPage(1).getWidth()).toBe(350);
  expect(checked.getPage(0).getRotation().angle).toBe(180);
  expect(checked.getPage(0).getCropBox().x).toBe(6);
  expect(checked.getPage(0).getCropBox().width).toBe(200);
  expect(doc.getPageCount()).toBe(4);
  expect(Array.from(await doc.save())).toEqual(Array.from(snapshot));
 });
 it("refuses invalid reordering before constructing a new PDF",async()=>{
  const doc=await PDFDocument.create();
  doc.addPage([500,600]);
  await expect(exportReorderedPdf(doc,"1,1")).rejects.toThrow(/more than once/);
  await expect(exportReorderedPdf(doc,"2")).rejects.toThrow(/bounds/);
 });
});
